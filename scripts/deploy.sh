#!/usr/bin/env bash
#
# Update a deployed app on the VPS. Run ON the server as root:
#
#     /srv/apps/deploy.sh member      # member.pickabook.lk
#     /srv/apps/deploy.sh quiz        # quiz.pickabook.lk
#     /srv/apps/deploy.sh both
#
set -euo pipefail

deploy_one() {
  local name=$1 dir=$2 svc=$3 host=$4

  echo "=== ${name} ==="
  cd "$dir"

  local before
  before=$(sudo -u pab git rev-parse --short HEAD)
  sudo -u pab git fetch --quiet origin
  sudo -u pab git reset --hard --quiet origin/main
  echo "  ${before} -> $(sudo -u pab git rev-parse --short HEAD)"

  # Full install, NOT --omit=dev: tailwind, postcss and typescript are
  # devDependencies and the build cannot run without them.
  sudo -u pab npm ci --no-audit --no-fund --silent
  sudo -u pab npm approve-scripts --allow-scripts-pending >/dev/null 2>&1 || true

  # Turbopack will happily reuse a chunk cached from a failed or older build,
  # which produces module-resolution errors that look like missing packages.
  # Cheap to avoid, expensive to debug.
  sudo -u pab rm -rf .next

  sudo -u pab env NODE_ENV=production npm run build

  systemctl restart "$svc"
  sleep 6

  local code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "https://${host}/" || echo 000)
  if [ "$code" = "200" ]; then
    echo "  OK  https://${host} -> 200"
  else
    echo "  FAILED  https://${host} -> ${code}"
    journalctl -u "$svc" -n 25 --no-pager
    return 1
  fi
}

case "${1:-both}" in
  member) deploy_one "member portal" /srv/apps/member-register pab-member member.pickabook.lk ;;
  quiz)   deploy_one "quiz night"    /srv/apps/web-game        pab-quiz   quiz.pickabook.lk ;;
  both)
    deploy_one "member portal" /srv/apps/member-register pab-member member.pickabook.lk
    deploy_one "quiz night"    /srv/apps/web-game        pab-quiz   quiz.pickabook.lk
    ;;
  *) echo "usage: $0 [member|quiz|both]"; exit 2 ;;
esac
