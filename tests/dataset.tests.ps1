param(
    [string]$DatasetPath = (Join-Path $PSScriptRoot '../hackathon dataset anonymized.csv')
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$rows = @(Import-Csv -LiteralPath $DatasetPath -Encoding utf8)
$failed = 0

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$tests = [ordered]@{
    'Quality flags contain explicit boolean values for every contractor' = {
        Assert-True ($rows.Count -gt 0) 'Dataset is empty'
        foreach ($row in $rows) {
            foreach ($field in @('synthetic', 'city_imputed', 'price_imputed')) {
                Assert-True (@('True', 'False') -ccontains $row.$field) "Invalid $field flag for $($row.id): '$($row.$field)'"
            }
        }
    }
    'Dataset has the documented schema and 66 unique contractor IDs' = {
        $columns = @(
            'id', 'anon_name', 'categories', 'city', 'city_imputed', 'synthetic',
            'price_from_kzt', 'price_imputed', 'event_formats', 'languages',
            'max_hours', 'busy_dates', 'description'
        )
        Assert-True ($rows.Count -eq 66) "Expected 66 contractors, got $($rows.Count)"
        $actualColumns = @($rows[0].PSObject.Properties.Name)
        Assert-True (($actualColumns -join ',') -ceq ($columns -join ',')) 'Unexpected CSV columns'
        foreach ($row in $rows) {
            Assert-True ($row.id -cmatch '^HK-[0-9]{5}$') "Invalid contractor ID: $($row.id)"
        }
        Assert-True (@($rows.id | Sort-Object -Unique).Count -eq $rows.Count) 'Duplicate contractor IDs'
    }
    'Busy dates are real ISO dates within the documented dataset period' = {
        Assert-True ($rows.Count -gt 0) 'Dataset is empty'
        $dateCount = 0
        foreach ($row in $rows) {
            if ([string]::IsNullOrWhiteSpace($row.busy_dates)) { continue }
            foreach ($value in $row.busy_dates.Split('|')) {
                $parsed = [datetime]::MinValue
                $valid = [datetime]::TryParseExact(
                    $value, 'yyyy-MM-dd', [cultureinfo]::InvariantCulture,
                    [System.Globalization.DateTimeStyles]::None, [ref]$parsed
                )
                Assert-True $valid "Invalid busy date for $($row.id): $value"
                Assert-True ($value -ge '2026-09-23' -and $value -le '2026-12-31') "Busy date out of range for $($row.id): $value"
                $dateCount++
            }
        }
        Assert-True ($dateCount -gt 0) 'No busy dates were checked'
    }
}

foreach ($test in $tests.GetEnumerator()) {
    try {
        & $test.Value
        Write-Host "PASS: $($test.Key)"
    } catch {
        $failed++
        Write-Host "FAIL: $($test.Key): $_"
    }
}

Write-Host "$($tests.Count - $failed)/$($tests.Count) tests passed"
if ($failed -gt 0) { exit 1 }
