#!/bin/bash

echo "🚀 Canal Monitoring API Quick Setup"
echo "===================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check if MongoDB is running (optional check)
echo "🔄 Checking MongoDB connection..."

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ .env file created. Please edit it with your MongoDB URI if needed."
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Initialize database
echo "🗄️  Initializing database with sample data..."
npm run init-db

if [ $? -ne 0 ]; then
    echo "⚠️  Database initialization failed. Check your MongoDB connection."
    echo "   Make sure MongoDB is running and MONGODB_URI in .env is correct."
    exit 1
fi

echo ""
echo "🎉 Setup completed successfully!"
echo ""
echo "📋 Next steps:"
echo "   1. Start the server:    npm run dev"
echo "   2. Test the API:        npm test"
echo "   3. Simulate ESP32:      npm run simulate"
echo ""
echo "🔗 API will be available at: http://localhost:3001"
echo "📖 Check README.md for ESP32 integration guide"
echo ""
echo "🚀 Your canal monitoring API is ready!"