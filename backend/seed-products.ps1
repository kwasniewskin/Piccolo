param(
    [string]$Token = $env:PICCOLO_API_TOKEN
)

$products = @(
    @{ name = "Rolled oats"; caloriesPer100g = 379; proteinPer100g = 13.2; fatPer100g = 6.5; carbsPer100g = 67.7; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Banana"; caloriesPer100g = 89; proteinPer100g = 1.1; fatPer100g = 0.3; carbsPer100g = 22.8; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Milk 2%"; caloriesPer100g = 50; proteinPer100g = 3.4; fatPer100g = 2; carbsPer100g = 4.8; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Chicken egg"; caloriesPer100g = 143; proteinPer100g = 12.6; fatPer100g = 9.5; carbsPer100g = 0.7; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Cottage cheese"; caloriesPer100g = 133; proteinPer100g = 18.7; fatPer100g = 4.7; carbsPer100g = 3.7; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Natural skyr"; caloriesPer100g = 64; proteinPer100g = 11; fatPer100g = 0.2; carbsPer100g = 4; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Rye bread"; caloriesPer100g = 259; proteinPer100g = 8.5; fatPer100g = 3.3; carbsPer100g = 48.3; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Butter"; caloriesPer100g = 717; proteinPer100g = 0.9; fatPer100g = 81; carbsPer100g = 0.1; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Chicken breast"; caloriesPer100g = 120; proteinPer100g = 22.5; fatPer100g = 2.6; carbsPer100g = 0; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "White rice cooked"; caloriesPer100g = 130; proteinPer100g = 2.7; fatPer100g = 0.3; carbsPer100g = 28.2; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Boiled potatoes"; caloriesPer100g = 87; proteinPer100g = 1.9; fatPer100g = 0.1; carbsPer100g = 20.1; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Potato dumplings"; caloriesPer100g = 198; proteinPer100g = 6.4; fatPer100g = 5.8; carbsPer100g = 30.1; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Salmon fillet"; caloriesPer100g = 208; proteinPer100g = 20; fatPer100g = 13; carbsPer100g = 0; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Broccoli"; caloriesPer100g = 34; proteinPer100g = 2.8; fatPer100g = 0.4; carbsPer100g = 6.6; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Tomato"; caloriesPer100g = 18; proteinPer100g = 0.9; fatPer100g = 0.2; carbsPer100g = 3.9; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Apple"; caloriesPer100g = 52; proteinPer100g = 0.3; fatPer100g = 0.2; carbsPer100g = 13.8; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Kefir"; caloriesPer100g = 51; proteinPer100g = 3.4; fatPer100g = 2; carbsPer100g = 4.7; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Almonds"; caloriesPer100g = 579; proteinPer100g = 21.2; fatPer100g = 49.9; carbsPer100g = 21.6; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Pasta cooked"; caloriesPer100g = 158; proteinPer100g = 5.8; fatPer100g = 0.9; carbsPer100g = 30.9; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Olive oil"; caloriesPer100g = 884; proteinPer100g = 0; fatPer100g = 100; carbsPer100g = 0; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null },
    @{ name = "Dark chocolate 70%"; caloriesPer100g = 598; proteinPer100g = 7.8; fatPer100g = 42.6; carbsPer100g = 45.9; brand = $null; saturatedFatPer100g = $null; sugarsPer100g = $null; fiberPer100g = $null; saltPer100g = $null; packageWeightGrams = $null; dataSource = "System"; createdByUserId = $null; imageUrl = $null }
)

$baseUrl = "http://localhost:5022/api/products"

$headers = @{}
if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
}

Write-Host "Adding products to database..." -ForegroundColor Green

foreach ($product in $products) {
    $json = $product | ConvertTo-Json
    try {
        $response = Invoke-RestMethod -Uri $baseUrl -Method Post -Headers $headers -Body $json -ContentType "application/json" -UseBasicParsing
        Write-Host "Added: $($product.name)" -ForegroundColor Cyan
    } catch {
        Write-Host "Error adding: $($product.name)" -ForegroundColor Red
        Write-Host "Details: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

Write-Host "`nDone! Checking product count..." -ForegroundColor Green
$searchResult = Invoke-RestMethod -Uri "$baseUrl/search?name=a" -Headers $headers -UseBasicParsing
Write-Host "Products in database: $($searchResult.Count)" -ForegroundColor Cyan
