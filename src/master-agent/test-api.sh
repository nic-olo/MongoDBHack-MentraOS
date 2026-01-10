#!/bin/bash

# Test script for Master Agent API

BASE_URL="http://localhost:3001"

echo "🧪 Testing Master Agent API"
echo ""

# 1. Health check
echo "1️⃣  Health Check..."
curl -s "$BASE_URL/health" | jq '.'
echo ""

# 2. Submit a query
echo "2️⃣  Submitting Query..."
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/query" \
  -H "Content-Type: application/json" \
  -d '{"query": "Add category filtering to the notification system"}')

echo "$RESPONSE" | jq '.'
TASK_ID=$(echo "$RESPONSE" | jq -r '.task_id')
echo ""

# 3. Wait a bit
echo "3️⃣  Waiting for processing (15 seconds)..."
sleep 15
echo ""

# 4. Check task status
echo "4️⃣  Checking Task Status..."
curl -s "$BASE_URL/agent/task/$TASK_ID" | jq '.'
echo ""

# 5. List all tasks
echo "5️⃣  Listing All Tasks..."
curl -s "$BASE_URL/agent/tasks" | jq '.tasks[] | {id, query, status}'
echo ""

echo "✅ Test complete!"
