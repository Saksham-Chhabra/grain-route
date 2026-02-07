import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    role: {
        type: String,
        enum: ['farm_rep', 'warehouse_mgr', 'ngo', 'admin'],
        required: true
    },
    nodeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Node'
    },
    token: {
        type: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
},{ timestamps: true });


export const User = mongoose.model("User", userSchema);