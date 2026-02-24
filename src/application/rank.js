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
      // ✅ only completed attempts + only free/paid
      {
        $match: {
          status: "submitted",
          submittedAt: { $ne: null },
          paymentType: { $in: ["free", "paid"] }, // ✅ exclude practise
        },
      },

      // ✅ best attempt per (studentId+paperId) by points
      {
        $sort: {
          studentId: 1,
          paperId: 1,
          totalPointsEarned: -1,
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

      // ✅ sum per student => totalCoins(points) + totalFinishedExams
      {
        $group: {
          _id: "$studentId",
          totalCoins: { $sum: { $ifNull: ["$totalPointsEarned", 0] } },
          totalFinishedExams: { $sum: 1 },
          lastSubmittedAt: { $max: "$submittedAt" },
        },
      },

      // ✅ single numeric score to allow denseRank sortBy with one field
      {
        $addFields: {
          lastTime: { $toLong: { $ifNull: ["$lastSubmittedAt", new Date(0)] } },
        },
      },
      {
        $addFields: {
          score: {
            $add: [
              { $multiply: ["$totalCoins", 1000000000000000] }, // 1e15
              { $multiply: ["$totalFinishedExams", 1000000000000] }, // 1e12
              "$lastTime",
            ],
          },
        },
      },

      { $sort: { score: -1 } },

      {
        $setWindowFields: {
          sortBy: { score: -1 },
          output: {
            rank: { $denseRank: {} },
          },
        },
      },

      // attach user
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          studentId: { $toString: "$_id" },
          name: { $ifNull: ["$user.name", "Student"] },
          totalCoins: 1, // ✅ points
          totalFinishedExams: 1,
          rank: 1,
        },
      },

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

    if (String(err?.message || "").includes("$setWindowFields")) {
      return res.status(500).json({
        message:
          "MongoDB does not support ranking ($setWindowFields). Upgrade MongoDB to 5.0+ (Atlas is OK).",
      });
    }

    return res.status(500).json({ message: "Internal server error" });
  }
};