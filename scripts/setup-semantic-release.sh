#!/bin/bash

# Semantic Release Setup Script for Guardian
# This script installs and configures semantic-release

echo "🚀 Setting up Semantic Release for Guardian..."
echo ""

# Install semantic-release and plugins
echo "📦 Installing semantic-release dependencies..."
npm install --save-dev \
  semantic-release \
  @semantic-release/changelog \
  @semantic-release/git \
  @semantic-release/github \
  @semantic-release/npm \
  @semantic-release/commit-analyzer \
  @semantic-release/release-notes-generator

echo ""
echo "📝 Installing commit message enforcement..."
npm install --save-dev \
  @commitlint/cli \
  @commitlint/config-conventional \
  husky

echo ""
echo "✨ Installing commitizen (optional but recommended)..."
npm install --save-dev \
  commitizen \
  cz-conventional-changelog

echo ""
echo "🔧 Setting up Husky git hooks..."
npx husky install
npx husky add .husky/commit-msg 'npx --no -- commitlint --edit "$1"'

echo ""
echo "📋 Configuring git commit template..."
git config commit.template .gitmessage

echo ""
echo "✅ Semantic Release setup complete!"
echo ""
echo "Next steps:"
echo "1. Add NPM_TOKEN to GitHub repository secrets"
echo "2. Make your first commit using: npm run commit"
echo "3. Push to main branch to trigger first release"
echo ""
echo "Usage:"
echo "  npm run commit         # Interactive commit with commitizen"
echo "  npm run semantic-release --dry-run  # Preview release"
echo ""
echo "Commit format:"
echo "  feat: add new feature  # Minor version bump"
echo "  fix: bug fix          # Patch version bump"
echo "  feat!: breaking       # Major version bump"
echo ""
