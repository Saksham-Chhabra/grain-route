import mongoose from "mongoose";

const batchSchema = new mongoose.Schema({
    parentBatchId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Batch",
        default: null
    },
    foodType: {
        type: String,

    },
    quantity_kg: {
        type: Number,
        
    },
    original_quantity_kg: {
        type: Number,
        
    },
    originNode: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Node',
    },
    currentNode: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Node'
    },
    status: {
        type: String,
        enum: ['stored', 'in_transit', 'delivered', 'spoiled', 'reserved'],
        default: 'stored'
    },
    shelf_life_hours: {
        type: Number
    },
    manufacture_date: {
        type: Date
    },
    expiry_iso: {
        type: Date
    },
    initial_temp_c: {
        type: Number
    },
    freshnessPct: {
        type: Number,
        default: 100
    },
    history: [{
        time: { type: Date },
        action: { type: String },
        from: { type: mongoose.Schema.Types.ObjectId, ref: 'Node' },
        to: { type: mongoose.Schema.Types.ObjectId, ref: 'Node' },
        note: { type: String }
    }],
    metadata: {
        type: Object
    }
},{ timestamps: true });


export const Batch = mongoose.model("Batch", batchSchema);