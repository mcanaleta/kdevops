#! /bin/sh

set -e
set -x

pnpm run build
# git status --porcelain .    

# if git status --porcelain . | grep -q .; then
#     echo "Working directory is not clean. Please commit all changes before releasing."
#     exit 1
# fi

npm version patch
# git add .
# git commit -m "Bump version"
git push
pnpm publish --access public --no-git-checks
