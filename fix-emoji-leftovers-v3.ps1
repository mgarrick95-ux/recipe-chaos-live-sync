# fix-emoji-leftovers-v3.ps1 (ASCII-only, exact codepoint matches)
function Ch([int]$cp) { [char]$cp }
function Emoji([int]$cp) { [char]::ConvertFromUtf32($cp) }

$MJ_0 = (Ch 0x00F0) + (Ch 0x0178)     # ðŸ
$C_8D = Ch 0x008D
$C_8F = Ch 0x008F

# Exact sequences from your codepoint dump
$MJ_BREAD = $MJ_0 + $C_8D + (Ch 0x017E)                         # ð Ÿ 008D ž
$MJ_TAG   = $MJ_0 + $C_8F + (Ch 0x00B7) + (Ch 0x00EF) + (Ch 0x00B8) + $C_8F   # ð Ÿ 008F · ï ¸ 008F
$MJ_APPLE = $MJ_0 + $C_8D + $C_8F                               # ð Ÿ 008D 008F

# Replacements (generated, no emoji literals in file)
$E_BREAD = Emoji 0x1F35E
$E_TAG   = (Emoji 0x1F3F7) + (Emoji 0xFE0F)
$E_APPLE = Emoji 0x1F34E

$targets = @(
  ".\lib\rc\heroThemes.ts",
  ".\app\frostpantry\page.tsx"
) | Where-Object { Test-Path $_ }

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$changed = @()
foreach ($path in $targets) {
  $original = [System.IO.File]::ReadAllText($path, $utf8NoBom)
  $content = $original

  $content = $content.Replace($MJ_BREAD, $E_BREAD)
  $content = $content.Replace($MJ_TAG,   $E_TAG)

  # only replace the apple when it's inside the emoji string
  $content = $content.Replace(('emoji: "' + $MJ_APPLE + '"'), ('emoji: "' + $E_APPLE + '"'))

  if ($content -ne $original) {
    [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
    $changed += $path
  }
}

"Changed files: $($changed.Count)"
$changed | ForEach-Object { " - $_" }
