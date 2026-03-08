# fix-emoji-leftovers-v2.ps1 (ASCII-only, targeted)

function Ch([int]$cp) { [char]$cp }
function Emoji([int]$cp) { [char]::ConvertFromUtf32($cp) }

# "ðŸ" prefix
$MJ_0 = (Ch 0x00F0) + (Ch 0x0178)   # ð + Ÿ

# Correct remaining mojibake sequences (from what rg is showing)
$MJ_ICE    = $MJ_0 + (Ch 0x00A7) + (Ch 0x0160)   # ðŸ§Š  (Š = U+0160)
$MJ_BREAD  = $MJ_0 + (Ch 0x017E)                 # ðŸž   (ž = U+017E)
$MJ_MILK   = $MJ_0 + (Ch 0x00A5) + (Ch 0x203A)   # ðŸ¥›  (› = U+203A)
$MJ_TAG    = $MJ_0 + (Ch 0x00B7) + (Ch 0x00EF) + (Ch 0x00B8)  # ðŸ·ï¸

# Emoji replacements (generated)
$E_ICE    = Emoji 0x1F9CA
$E_BREAD  = Emoji 0x1F35E
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

  $content = $content.Replace($MJ_ICE,   $E_ICE)
  $content = $content.Replace($MJ_BREAD, $E_BREAD)
  $content = $content.Replace($MJ_MILK,  $E_MILK)
  $content = $content.Replace($MJ_TAG,   $E_TAG)

  # Fix the partial apple: emoji: "ðŸ"  (allow trailing comma/space)
  $content = $content -replace ('emoji:\s*"' + [regex]::Escape($MJ_0) + '"'), ('emoji: "' + $E_APPLE + '"')

  if ($content -ne $original) {
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
    $changed += $path
  }
}

"Changed files: $($changed.Count)"
$changed | ForEach-Object { " - $_" }
