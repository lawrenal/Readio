#!/bin/sh
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting server on 0.0.0.0:3000..."
exec npx next start -H 0.0.0.0 -p 3000
