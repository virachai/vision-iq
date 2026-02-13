#!/bin/bash

# Script to kill processes running on project ports
# Usage: ./kill-ports.sh

PORTS=(3001 3002 3003 3004 3005 3006 3007 3008)

echo "🔍 Checking for processes on ports: ${PORTS[*]}..."

# Function to kill process on a specific port
kill_port() {
  local port=$1
  
  # Find PIDs on Windows (using netstat)
  # awk '{print $5}' gets the PID column from netstat -ano
  local pids=$(netstat -ano | grep ":$port " | grep "LISTENING" | awk '{print $5}' | sort -u)
  
  if [ -n "$pids" ]; then
    for pid in $pids; do
      echo "✅ Found process $pid on port $port"
      taskkill //PID $pid //F
      echo "✅ Killed process $pid on port $port"
    done
  else
    echo "ℹ️  No process found on port $port"
  fi
}

# Kill processes on all ports
for port in "${PORTS[@]}"; do
  kill_port $port
done

echo ""
echo "✅ Done! All project ports are now available."

