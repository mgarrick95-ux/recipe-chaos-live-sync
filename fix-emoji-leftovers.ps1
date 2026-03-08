# fix-emoji-leftovers.ps1 (ASCII-only, targeted)
function Ch([int]$cp) { [char]$cp }
function Emoji([int]$cp) { [char]::ConvertFromUtf32($cp) }

# Build remaining bad strings (no literal mojibake typed)
$MJ_0 = (Ch 0x00F0) + (Ch 0x0178)                  # ðŸ
$MJ_CAN    = $MJ_0 + (Ch 0x00A5) + (Ch 0x00AB)     # ðŸ¥«
$MJ_ICE    = $MJ_0 + (Ch 0x00A7) + (Ch 0x008A)     # ðŸ§Š
$MJ_BREAD  = $MJ_0 + (Ch 0x017E)                   # ðŸž
$MJ_MILK   = $MJ_0 + (Ch 0x00A5) + (Ch 0x009B)     # ðŸ¥›
$MJ_TAG    = $MJ_0 + (Ch 0x00B7) + (Ch 0x00EF) + (Ch 0x00B8)  # ðŸ·ï¸

# Corrupted cheese: ðŸ§"
$MJ_CHEESE_BAD = $MJ_0 + (Ch 0x00A7) + (Ch 0x0022) # ðŸ§"

# Real emoji replacements (no literal emoji typed)
$E_CAN    = Emoji 0x1F96B
$E_ICE    = Emoji 0x1F9CA
$E_BREAD  = Emoji 0x1F35E
$E_CHEESE = Emoji 0x1F9C0
$E_MILK   = Emoji 0x1F95B
$E_TAG    = (Emoji 0x1F3F7) + (Emoji 0xFE0F)
$E_APPLE  = Emoji 0x1F34E

$targets = @(
  ".\lib\rc\heroThemes.ts",
  ".\app\frostpantry\page.tsx"
) | Where-Object { Test-Path $_ }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$changed = @()

foreach ($path in $targets) {
  $original = [System.IO.File]::ReadAllText($path, $utf8NoBom)
  $content = $original

  # Replace remaining mojibake
  $content = $content.Replace($MJ_CAN,  $E_CAN)
  $content = $content.Replace($MJ_ICE,  $E_ICE)
  $content = $content.Replace($MJ_BREAD,$E_BREAD)
  $content = $content.Replace($MJ_MILK, $E_MILK)
  $content = $content.Replace($MJ_TAG,  $E_TAG)

  # Fix corrupted cheese and partial apple
  $content = $content.Replace($MJ_CHEESE_BAD, $E_CHEESE)
  $content = $content -replace 'emoji:\s*"' + [regex]::Escape($MJ_0) + '"\s*', ('emoji: "' + $E_APPLE + '"')

  if ($content -ne $original) {
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
    $changed += $path
  }
}

"Changed files: $($changed.Count)"
$changed | ForEach-Object { " - $_" }
