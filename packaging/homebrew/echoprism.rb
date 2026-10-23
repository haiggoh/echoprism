# Homebrew cask TEMPLATE for EchoPrism — lives in the OWNER's tap after the
# first release (this file is the source the tap copies from; the tap repo is
# outside this repository).
#
# FILL-IN RECIPE (after the first GitHub release exists — a cask pointing at
# a missing asset 404s for every user):
#   1. Replace OWNER/REPO below with the real GitHub slug.
#   2. Set version to the released tag (without the leading v).
#   3. Download the release's EchoPrism_<version>_aarch64.dmg and run
#      `shasum -a 256 <file>` — paste the digest as sha256.
#   4. Commit the cask to the tap as Casks/echoprism.rb, then
#      `brew install --cask <tapname>/echoprism` and LAUNCH it once —
#      installing cleanly is not the same as working (dogfood, don't stop
#      at "brew said ok").
cask "echoprism" do
  version "0.1.0"
  sha256 :_PLACEHOLDER_FILL_FROM_THE_RELEASE_DMG_

  url "https://github.com/OWNER/REPO/releases/download/v#{version}/EchoPrism_#{version}_aarch64.dmg"
  name "EchoPrism"
  desc "Unified video and podcast player — YouTube watching and podcast listening in one stream"
  homepage "https://github.com/OWNER/REPO"

  # UNSIGNED BUILD: Gatekeeper blocks first launch. `brew install --cask`
  # succeeds but the app needs the one-time approve (right-click → Open) or
  # `xattr -cr "/Applications/EchoPrism.app"`.
  app "EchoPrism.app"

  # No auto_update stanza: unsigned builds cannot self-update; users check
  # for releases via scripts/check-updates.sh and rebuild.
end
