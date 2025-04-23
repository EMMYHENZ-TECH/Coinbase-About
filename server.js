import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Convert ESM file URL to file path
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// Initialize or load chat data
const chatDataPath = path.join(dataDir, 'chats.json');
let chatData = {
  users: [
    { id: 'admin', username: 'cblpro001', password: 'ogfundz', isAdmin: true }
  ],
  messages: [],
  userCounter: 1
};

// Load existing data if available
if (fs.existsSync(chatDataPath)) {
  try {
    const fileData = fs.readFileSync(chatDataPath, 'utf8');
    chatData = JSON.parse(fileData);
    console.log('Chat data loaded from file');
  } catch (error) {
    console.error('Error loading chat data:', error);
  }
}

// Function to save chat data to file
function saveChatData() {
  try {
    fs.writeFileSync(chatDataPath, JSON.stringify(chatData, null, 2), 'utf8');
    console.log('Chat data saved to file');
  } catch (error) {
    console.error('Error saving chat data:', error);
  }
}

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/support', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'support.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Socket.io for real-time chat
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // User authentication
  socket.on('authenticate', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} authenticated`);
    
    // If this is a new user, add them to our users array
    if (userId !== 'admin' && !chatData.users.find(u => u.id === userId)) {
      chatData.users.push({
        id: userId,
        username: `User ${chatData.userCounter++}`,
        isAdmin: false
      });
      console.log(`New user created: ${userId}`);
      saveChatData();
    }
    
    // Send existing messages to the user
    if (userId === 'admin') {
      // For admin, send all messages grouped by user
      const userMessages = {};
      
      chatData.messages.forEach(msg => {
        if (!userMessages[msg.userId]) {
          userMessages[msg.userId] = [];
        }
        userMessages[msg.userId].push(msg);
      });
      
      socket.emit('chat_history', userMessages);
    } else {
      // For regular users, send only their messages
      const userMessages = chatData.messages.filter(msg => msg.userId === userId);
      socket.emit('chat_history', userMessages);
    }
  });
  
  // Handle chat messages
  socket.on('chat message', (data) => {
    const { userId, message, sender } = data;
    
    if (!userId || !message || !sender) {
      return socket.emit('error', 'Missing required fields');
    }
    
    const newMessage = {
      id: Date.now().toString(),
      userId,
      message,
      sender,
      timestamp: Date.now(),
      read: false
    };
    
    // Save to our database
    chatData.messages.push(newMessage);
    saveChatData();
    
    // Broadcast to the specific user and all admins
    socket.to(userId).emit('chat message', newMessage);
    
    // Find admin users and broadcast to them
    chatData.users.filter(u => u.isAdmin).forEach(admin => {
      socket.to(admin.id).emit('chat message', newMessage);
    });
    
    // Acknowledge receipt
    socket.emit('message received', { id: newMessage.id });
    
    // If user sends a message, generate an automatic admin response after a delay
    if (sender === 'user') {
      setTimeout(() => {
        const adminResponse = {
          id: Date.now().toString(),
          userId,
          message: "Please kindly wait for reply, admin would be online soon... 💯",
          sender: 'admin',
          timestamp: Date.now(),
          read: false
        };
        
        chatData.messages.push(adminResponse);
        saveChatData();
        
        // Send to the user
        io.to(userId).emit('chat message', adminResponse);
        
        // Send to all admins
        chatData.users.filter(u => u.isAdmin).forEach(admin => {
          io.to(admin.id).emit('chat message', adminResponse);
        });
      }, 2000);
    }
  });
  
  // Get latest messages
  socket.on('get_latest_messages', () => {
    // Only respond to admin requests
    const socketRooms = Array.from(socket.rooms);
    if (socketRooms.includes('admin')) {
      // Group messages by userId
      const userMessages = {};
      
      chatData.messages.forEach(msg => {
        if (!userMessages[msg.userId]) {
          userMessages[msg.userId] = [];
        }
        userMessages[msg.userId].push(msg);
      });
      
      // Send to admin
      socket.emit('latest_messages', userMessages);
    }
  });
  
  // Mark messages as read
  socket.on('mark_read', (data) => {
    const { messageId } = data;
    
    if (!messageId) {
      return socket.emit('error', 'Missing message ID');
    }
    
    // Find and mark the message as read
    const message = chatData.messages.find(m => m.id === messageId);
    if (message) {
      message.read = true;
      saveChatData();
    }
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start the server
const PORT = process.env.PORT || 7860;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

console.log('Server is ready to handle connections!');
