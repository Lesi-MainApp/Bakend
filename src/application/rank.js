// src/application/rank.js
import mongoose from "mongoose";
import PaperAttempt from "../infastructure/schemas/paperAttempt.js";

const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

export const getIslandRank = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const limit = Math.min(Math.max(toInt(req.query?.limit, 50), 1), 200);
    const uid = new mongoose.Types.ObjectId(String(userId));

    const pipeline = [
      // 1) only completed attempts
      {
        $match: {
          status: "submitted",
          submittedAt: { $ne: null },
        },
      },

      // 2) choose BEST attempt per (studentId + paperId)
      // best = higher correctCount, then higher percentage, then latest submittedAt
      {
        $sort: {
          studentId: 1,
          paperId: 1,
          correctCount: -1,
          percentage: -1,
          submittedAt: -1,
        },
      },
      {
        $group: {
          _id: { studentId: "$studentId", paperId: "$paperId" },
          bestAttempt: { $first: "$$ROOT" },
        },
      },
      { $replaceRoot: { newRoot: "$bestAttempt" } },

      // 3) sum per student => totalCoins + totalFinishedExams + lastSubmittedAt
      {
        $group: {
          _id: "$studentId",
          totalCoins: { $sum: { $ifNull: ["$correctCount", 0] } },
          totalFinishedExams: { $sum: 1 },
          lastSubmittedAt: { $max: "$submittedAt" },
        },
      },

      // 4) build ONE numeric score so we can sort with exactly 1 field
      // score priority:
      // - totalCoins (biggest weight)
      // - totalFinishedExams (next)
      // - lastSubmittedAt (latest wins tie)
      //
      // NOTE: This assumes coins/exams won't exceed these ranges (safe for your app).
      {
        $addFields: {
          lastTime: { $toLong: { $ifNull: ["$lastSubmittedAt", new Date(0)] } },
        },
      },
      {
        $addFields: {
          // score = coins*1e15 + exams*1e12 + lastTime
          // (large multipliers make coins dominate exams, exams dominate time)
          score: {
            $add: [
              { $multiply: ["$totalCoins", 1000000000000000] }, // 1e15
              { $multiply: ["$totalFinishedExams", 1000000000000] }, // 1e12
              "$lastTime",
            ],
          },
        },
      },

      // 5) sort by ONE field only (required by your MongoDB)
      { $sort: { score: -1 } },

      // 6) rank using window fields with single-field sortBy
      {
        $setWindowFields: {
          sortBy: { score: -1 },
          output: {
            rank: { $denseRank: {} },
          },
        },
      },

      // 7) attach user name
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

      // 8) shape output
      {
        $project: {
          studentId: { $toString: "$_id" },
          name: { $ifNull: ["$user.name", "Student"] },
          totalCoins: 1,
          totalFinishedExams: 1,
          rank: 1,
        },
      },

      // 9) return top + me
      {
        $facet: {
          top: [{ $limit: limit }],
          me: [{ $match: { _id: uid } }, { $limit: 1 }],
        },
      },
    ];

    const out = await PaperAttempt.aggregate(pipeline);

    const top = out?.[0]?.top || [];
    const me = (out?.[0]?.me || [])[0] || {
      studentId: String(userId),
      name: "",
      totalCoins: 0,
      totalFinishedExams: 0,
      rank: 0,
    };

    return res.status(200).json({ top, me });
  } catch (err) {
    console.error("getIslandRank error:", err);

    // If Mongo doesn't support window fields at all:
    if (String(err?.message || "").includes("$setWindowFields")) {
      return res.status(500).json({
        message:
          "MongoDB does not support ranking ($setWindowFields). Upgrade MongoDB to 5.0+ (Atlas is OK).",
      });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};