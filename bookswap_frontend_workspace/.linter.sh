#!/bin/bash
cd /home/kavia/workspace/code-generation/bookmatchai-114780-8d7cab39/bookswap_frontend_workspace/bookswap_frontend
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

