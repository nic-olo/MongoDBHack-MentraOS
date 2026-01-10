#!/bin/bash

# Test script for Agent Spawn/Kill/Monitor endpoints
# Run this after starting the Master Agent server

BASE_URL="http://localhost:3001"
AGENT_ID=""

echo "=========================================="
echo "🎯 AGENT CONTROL TEST SCRIPT"
echo "=========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print step
step() {
  echo -e "${YELLOW}▶ $1${NC}"
}

# Function to print success
success() {
  echo -e "${GREEN}✓ $1${NC}"
  echo ""
}

# Function to print error
error() {
  echo -e "${RED}✗ $1${NC}"
  echo ""
}

# Test 1: Health Check
step "Test 1: Health Check"
curl -s "$BASE_URL/health" | jq '.'
success "Health check passed"

# Test 2: Spawn a Scout Agent
step "Test 2: Spawn a Scout Agent"
RESPONSE=$(curl -s -X POST "$BASE_URL/agent/spawn" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_type": "scout",
    "query": "Find all authentication related files"
  }')

echo "$RESPONSE" | jq '.'
AGENT_ID=$(echo "$RESPONSE" | jq -r '.agent_id')
success "Agent spawned: $AGENT_ID"

sleep 1

# Test 3: Send Progress Update (Low Deviation - Should Continue)
step "Test 3: Send Progress Update (Low Deviation)"
curl -s -X POST "$BASE_URL/agent/$AGENT_ID/update" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "progress",
    "message": "Scanning directory structure",
    "data": {
      "progress": 25,
      "files_scanned": 150
    },
    "deviation_score": 15
  }' | jq '.'
success "Progress update sent (deviation: 15%)"

sleep 1

# Test 4: Send Finding Update
step "Test 4: Send Finding Update"
curl -s -X POST "$BASE_URL/agent/$AGENT_ID/update" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "finding",
    "message": "Found authentication module in src/auth/",
    "data": {
      "importance": "high",
      "files": ["src/auth/login.ts", "src/auth/session.ts"]
    },
    "deviation_score": 20
  }' | jq '.'
success "Finding update sent"

sleep 1

# Test 5: Check Agent Status
step "Test 5: Check Agent Status"
curl -s "$BASE_URL/agent/$AGENT_ID/status" | jq '.'
success "Agent status retrieved"

# Test 6: Spawn Another Agent (Analyzer)
step "Test 6: Spawn Analyzer Agent"
ANALYZER_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/spawn" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_type": "analyzer",
    "query": "Analyze authentication patterns"
  }')

echo "$ANALYZER_RESPONSE" | jq '.'
ANALYZER_ID=$(echo "$ANALYZER_RESPONSE" | jq -r '.agent_id')
success "Analyzer spawned: $ANALYZER_ID"

sleep 1

# Test 7: Send High Deviation Update (Should Trigger Kill)
step "Test 7: Send High Deviation Update (Should Auto-Kill)"
curl -s -X POST "$BASE_URL/agent/$ANALYZER_ID/update" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "warning",
    "message": "Deviating from analysis - investigating unrelated files",
    "data": {
      "progress": 30
    },
    "deviation_score": 85
  }' | jq '.'
error "High deviation detected! Agent should be auto-killed"

sleep 1

# Test 8: Check Active Agents
step "Test 8: Get All Active Agents"
curl -s "$BASE_URL/agent/active" | jq '.'
success "Active agents retrieved"

# Test 9: Manual Kill First Agent
step "Test 9: Manually Kill Scout Agent"
curl -s -X POST "$BASE_URL/agent/$AGENT_ID/kill" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Manual termination for testing"
  }' | jq '.'
success "Agent manually killed"

sleep 1

# Test 10: Get All Agents (Including Terminated)
step "Test 10: Get All Agents (Including Terminated)"
curl -s "$BASE_URL/agent/all" | jq '.'
success "All agents retrieved"

# Test 11: Spawn and Complete Agent
step "Test 11: Spawn Implementer and Complete It"
IMPL_RESPONSE=$(curl -s -X POST "$BASE_URL/agent/spawn" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_type": "implementer",
    "query": "Add login validation"
  }')

IMPL_ID=$(echo "$IMPL_RESPONSE" | jq -r '.agent_id')
echo "$IMPL_RESPONSE" | jq '.'
success "Implementer spawned: $IMPL_ID"

sleep 1

step "Test 11b: Send Progress Update"
curl -s -X POST "$BASE_URL/agent/$IMPL_ID/update" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "progress",
    "message": "Writing validation code",
    "data": { "progress": 75 },
    "deviation_score": 10
  }' | jq '.'
success "Progress update sent"

sleep 1

step "Test 11c: Mark as Complete"
curl -s -X POST "$BASE_URL/agent/$IMPL_ID/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "findings": "Successfully added email and password validation to login form"
  }' | jq '.'
success "Agent completed"

sleep 1

# Test 12: Test SSE Stream (5 seconds)
step "Test 12: Testing SSE Stream (listening for 5 seconds)"
echo "Listening to agent updates stream..."
timeout 5s curl -s "$BASE_URL/agent/updates/stream" || true
success "SSE stream test complete"

# Final Summary
echo ""
echo "=========================================="
echo "📊 TEST SUMMARY"
echo "=========================================="
echo ""
step "Final Health Check"
curl -s "$BASE_URL/health" | jq '.'

echo ""
echo -e "${GREEN}✅ All tests completed!${NC}"
echo ""
echo "Spawned Agents:"
echo "  - Scout: $AGENT_ID (killed manually)"
echo "  - Analyzer: $ANALYZER_ID (auto-killed for high deviation)"
echo "  - Implementer: $IMPL_ID (completed successfully)"
echo ""
