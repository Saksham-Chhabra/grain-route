import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";
import connectDB from "./src/db/index.js";
import { app } from "./src/app.js";

dotenv.config({
  path: "./.env",
});

// Create HTTP server and attach Socket.IO
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// Socket.IO event handlers
io.on("connection", (socket) => {
  console.log(`✅ Client connected: ${socket.id}`);

  socket.on("subscribe_today", (data) => {
    const { nodeIds } = data || {};
    console.log(`📡 Client ${socket.id} subscribed with nodeIds:`, nodeIds);
    socket.join("live_updates");
  });

  socket.on("disconnect", () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

// Export io for use in controllers
export { io };

// Store io in app for controller access
app.set("io", io);

connectDB()
  .then(() => {
    const port = process.env.PORT || 3001;
    httpServer.listen(port, () => {
      console.log(`⚙️  Server is running at port : ${port}`);
      console.log(`🔌 Socket.IO ready for real-time updates`);
    });
  })
  .catch((err) => {
    console.log("MONGO db connection failed !!! ", err);
  });
