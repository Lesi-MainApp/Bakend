import mongoose from "mongoose";
import Paper from "../infastructure/schemas/paper.js";
import Question from "../infastructure/schemas/question.js";
import PaperAttempt from "../infastructure/schemas/paperAttempt.js";
import User from "../infastructure/schemas/user.js";

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v || 0)));

const safeNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const oidStr = (v) => String(v || "");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id || ""));

const sumPaperMaxPoints = async (paperId) => {
  const rows = await Question.find({ paperId }).select("point").lean();
  let total = 0;
  for (const r of rows) total += safeNum(r?.point, 0);
  return Number(total.toFixed(2));
};

/**
 * ✅ Progress rules:
 * - Completed includes: free + paid + practise
 * - If completed < 10 -> progress max 30%
 * - If completed >= 10 -> progress = 30% + extra(0..70%)
 *   extra uses completion ratio (includes practise) + points ratio (free+paid only)
 * - Never decreases -> stored in User.progressHighWaterMark
 */
export const getMyProgress = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId || !isValidId(userId)) return res.status(401).json({ message: "Unauthorized" });

    // 1) all published papers for progress (include practise)
    const availableAll = await Paper.find({
      isActive: true,
      isPublished: true,
      payment: { $in: ["free", "paid", "practise"] },
    })
      .select("_id payment")
      .lean();

    const totalAvailableAll = availableAll.length;

    // 2) user submitted attempts (include practise)
    const attempts = await PaperAttempt.find({
      studentId: userId,
      status: "submitted",
      submittedAt: { $ne: null },
      paymentType: { $in: ["free", "paid", "practise"] },
    })
      .sort({ submittedAt: -1 })
      .select("paperId paymentType totalPointsEarned percentage submittedAt")
      .lean();

    // best attempt per paper (points desc -> percentage desc -> latest)
    const bestByPaper = new Map();
    for (const a of attempts) {
      const pid = oidStr(a.paperId);
      const curr = bestByPaper.get(pid);

      if (!curr) {
        bestByPaper.set(pid, a);
        continue;
      }

      const aPts = safeNum(a.totalPointsEarned, 0);
      const cPts = safeNum(curr.totalPointsEarned, 0);

      if (aPts > cPts) {
        bestByPaper.set(pid, a);
        continue;
      }

      if (aPts === cPts) {
        const aPct = safeNum(a.percentage, 0);
        const cPct = safeNum(curr.percentage, 0);

        if (aPct > cPct) {
          bestByPaper.set(pid, a);
          continue;
        }

        if (aPct === cPct) {
          const at = a?.submittedAt ? new Date(a.submittedAt).getTime() : 0;
          const ct = curr?.submittedAt ? new Date(curr.submittedAt).getTime() : 0;
          if (at > ct) bestByPaper.set(pid, a);
        }
      }
    }

    const completedCountAll = bestByPaper.size;

    // 3) coinsPoints (free+paid only) from best attempts
    let coinsPoints = 0;
    for (const [, a] of bestByPaper.entries()) {
      const pay = String(a?.paymentType || "").toLowerCase();
      if (pay === "free" || pay === "paid") coinsPoints += safeNum(a?.totalPointsEarned, 0);
    }
    coinsPoints = Number(coinsPoints.toFixed(2));

    // 4) max coins possible (free+paid only) from all published free+paid papers
    const freePaidPapers = availableAll.filter((p) => p.payment === "free" || p.payment === "paid");

    let maxCoinsPossible = 0;
    for (const p of freePaidPapers) {
      maxCoinsPossible += await sumPaperMaxPoints(p._id);
    }
    maxCoinsPossible = Number(maxCoinsPossible.toFixed(2));

    const pointsRatio = maxCoinsPossible > 0 ? clamp01(coinsPoints / maxCoinsPossible) : 0;
    const completionRatio = totalAvailableAll > 0 ? clamp01(completedCountAll / totalAvailableAll) : 0;

    // 5) your gate: first 10 completed => max 30%
    const N = Math.min(completedCountAll, 10);
    const base = 0.30 * (N / 10);

    let extra = 0;
    if (completedCountAll >= 10) {
      extra = 0.70 * (0.5 * completionRatio + 0.5 * pointsRatio);
    }

    const rawProgress = clamp01(base + extra);

    // 6) never decrease (DB high-water mark)
    const user = await User.findById(userId).select("progressHighWaterMark").lean();
    const prev = clamp01(user?.progressHighWaterMark || 0);

    const finalProgress = Math.max(prev, rawProgress);

    if (finalProgress > prev) {
      await User.findByIdAndUpdate(userId, {
        $set: { progressHighWaterMark: finalProgress, progressUpdatedAt: new Date() },
      });
    }

    return res.status(200).json({
      progress: Number(finalProgress.toFixed(4)),
      meta: {
        completedCountAll,
        totalAvailableAll,
        coinsPoints,
        maxCoinsPossible,
        pointsRatio: Number(pointsRatio.toFixed(4)),
        completionRatio: Number(completionRatio.toFixed(4)),
        base: Number(base.toFixed(4)),
        extra: Number(extra.toFixed(4)),
      },
    });
  } catch (err) {
    console.error("getMyProgress error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
};