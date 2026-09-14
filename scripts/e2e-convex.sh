#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${E2B_API_KEY:-}" ]]; then
  echo "E2B_API_KEY is required" >&2
  exit 1
fi

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
work_dir=$(mktemp -d /tmp/convex-e2b-runtime.XXXXXX)
container_name="convex-e2b-${RANDOM}-${RANDOM}"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT

docker run -d --name "$container_name" \
  -p 3210:3210 -p 3211:3211 \
  -e INSTANCE_NAME=e2e \
  -e INSTANCE_SECRET=4361726e697461732c206c69746572616c6c79206d65616e696e6720226c6974 \
  -e CONVEX_CLOUD_ORIGIN=http://127.0.0.1:3210 \
  -e CONVEX_SITE_ORIGIN=http://127.0.0.1:3211 \
  -e DISABLE_BEACON=true \
  ghcr.io/get-convex/convex-backend@sha256:1f2044e3eac463ac78973b136c0baf72d4ada602611d853d6f99f280e29e0a98 >/dev/null

ready=false
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null http://127.0.0.1:3210/version; then
    ready=true
    break
  fi
  sleep 2
done
if [[ "$ready" != true ]]; then
  echo "Convex backend did not become ready" >&2
  exit 1
fi

export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=$(docker exec "$container_name" ./generate_admin_key.sh | tail -1)
export CONVEX_SELF_HOSTED_ADMIN_KEY

cd "$repo_root"
npm run codegen
pack_name=$(npm pack --silent --pack-destination "$work_dir" | tail -1)
mv "$work_dir/$pack_name" "$work_dir/e2b-convex.tgz"
cp -R test/consumer "$work_dir/consumer"

cd "$work_dir/consumer"
npm install --silent
npx convex env set E2B_API_KEY "$E2B_API_KEY"
npx convex dev --once
npx convex run smoke:run '{}'
