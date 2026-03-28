$root = "c:\Users\patel\OneDrive\Desktop\tddtec\backend\quiz-frontend\src"
$files = @(
    "pages\LoginPage.js",
    "pages\RegisterPage.js",
    "pages\HomePage.js",
    "pages\GeneratePage.js",
    "pages\SharePage.js",
    "pages\StudyPage.js",
    "utils\export.js"
)
foreach ($f in $files) {
    $path = Join-Path $root $f
    if (Test-Path $path) {
        $content = [IO.File]::ReadAllText($path)
        $updated = $content -replace 'QuizForge', 'QuizGenius'
        [IO.File]::WriteAllText($path, $updated)
        Write-Host "Renamed: $f"
    } else {
        Write-Host "Missing: $f"
    }
}
Write-Host "Done."
