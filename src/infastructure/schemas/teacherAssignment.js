// backend/infastructure/schemas/teacherAssignment.js
import mongoose from "mongoose";
const { Schema } = mongoose;

const teacherAssignmentSchema = new Schema(
  {
    teacherId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },

    assignments: [
      {
        gradeId: { type: Schema.Types.ObjectId, ref: "Grade", required: true },
        streamId: { type: Schema.Types.ObjectId, default: null },
        subjectIds: [{ type: Schema.Types.ObjectId, required: true }],
      },
    ],

    assignedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

const TeacherAssignment =
  mongoose.models.TeacherAssignment || mongoose.model("TeacherAssignment", teacherAssignmentSchema);

export default TeacherAssignment;
