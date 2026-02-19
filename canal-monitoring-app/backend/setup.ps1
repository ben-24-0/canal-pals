Write-Host "🚀 Canal Monitoring API Quick Setup" -ForegroundColor Green
Write-Host "====================================" -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version 2>$null
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js 18+ first." -ForegroundColor Red
    Write-Host "   Download from: https://nodejs.org/" -ForegroundColor Yellow
    exit 1
}

# Check if npm is available
try {
    $npmVersion = npm --version 2>$null
    Write-Host "✅ npm found: $npmVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ npm is not available" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔄 Setting up environment..." -ForegroundColor Yellow

# Create .env file if it doesn't exist
if (!(Test-Path ".env")) {
    Write-Host "📝 Creating .env file..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "✅ .env file created. Please edit it with your MongoDB URI if needed." -ForegroundColor Green
} else {
    Write-Host "✅ .env file already exists" -ForegroundColor Green
}

# Install dependencies
Write-Host ""
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Dependencies installed successfully" -ForegroundColor Green

# Check if MongoDB is accessible
Write-Host ""
Write-Host "🗄️  Initializing database with sample data..." -ForegroundColor Yellow
npm run init-db

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Database initialization failed. Check your MongoDB connection." -ForegroundColor Yellow
    Write-Host "   Make sure MongoDB is running and MONGODB_URI in .env is correct." -ForegroundColor Yellow
    Write-Host "   You can install MongoDB locally or use MongoDB Atlas (cloud)" -ForegroundColor Cyan
} else {
    Write-Host "✅ Database initialized successfully" -ForegroundColor Green
}

Write-Host ""
Write-Host "🎉 Setup completed!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Available commands:" -ForegroundColor Cyan
Write-Host "   Start server:       npm run dev" -ForegroundColor White
Write-Host "   Test API:          npm test" -ForegroundColor White  
Write-Host "   Simulate ESP32:    npm run simulate" -ForegroundColor White
Write-Host "   Initialize DB:     npm run init-db" -ForegroundColor White
Write-Host ""
Write-Host "🔗 API will be available at: http://localhost:3001" -ForegroundColor Cyan
Write-Host "📖 Check README.md for ESP32 integration guide" -ForegroundColor Cyan
Write-Host ""
Write-Host "🚀 Your canal monitoring API is ready!" -ForegroundColor Green

# Ask if user wants to start the server
Write-Host ""
$startServer = Read-Host "Do you want to start the development server now? (y/N)"

if ($startServer.ToLower() -eq "y" -or $startServer.ToLower() -eq "yes") {
    Write-Host ""
    Write-Host "🚀 Starting development server..." -ForegroundColor Green
    npm run dev
}