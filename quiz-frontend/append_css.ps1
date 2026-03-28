$css = @"

/* == PREMIUM UTILITIES ======================== */
.text-gradient {
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.text-gradient-primary {
  background: linear-gradient(135deg, #1B2B4B 0%, #4F6AF5 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.page-fade { animation: pageFade .22s ease-out forwards; }
.hero-bg   { background: linear-gradient(180deg, #F0F4FF 0%, #FFFFFF 100%); }
.card-hover-lift { transition: transform .2s ease, box-shadow .2s ease; }
.card-hover-lift:hover { transform: translateY(-3px); box-shadow: 0 12px 36px rgba(0,0,0,.12); }
.skeleton {
  background: linear-gradient(90deg,#F9FAFB 25%,rgba(229,231,235,.65) 50%,#F9FAFB 75%);
  background-size: 400% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
  border-radius: 10px;
}
@keyframes pageFade  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
@keyframes float     { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
@keyframes fadeInUp  { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
@keyframes pulse-dot { 0%,100%{opacity:1;box-shadow:0 0 8px #10B981} 50%{opacity:.5;box-shadow:0 0 4px #10B981} }
"@
$path = "c:\Users\patel\OneDrive\Desktop\tddtec\backend\quiz-frontend\src\index.css"
[IO.File]::AppendAllText($path, $css)
Write-Host "Appended premium utilities OK"
