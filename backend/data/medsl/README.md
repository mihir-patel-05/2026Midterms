# MIT Election Lab source files

The map's **Past results** mode is built from three MIT Election Data + Science Lab (MEDSL) datasets on Harvard Dataverse. The CSVs are large, so they are not committed. Only this README is tracked.

| Folder and file | Dataset |
|---|---|
| `Presidental_county_2024/countypres_2000-2024.csv` | [County Presidential Election Returns 2000–2024](https://doi.org/10.7910/DVN/VOQCHQ) |
| `Senate/1976-2024-senate-state.csv` | [U.S. Senate Statewide 1976–2024](https://doi.org/10.7910/DVN/PEJ5QU) |
| `USHOUSE_1976-2024/1976-2024-house.tab` | [U.S. House 1976–2024](https://doi.org/10.7910/DVN/IG0UN2) |

## Updating

1. Download the new files from Dataverse into the folders above, keeping the same file names.
2. From `CODE/`, run `npm run build:past-results`.
3. Read the check report it prints:
   - national presidential totals per year
   - rows left out, by reason
   - counties with no map shape
   - House seat counts

   It exits with an error if a column is missing or a year looks incomplete.
4. Commit the regenerated `CODE/public/data/past-results/`.

The rules the script applies (vote-method rows, ballot-accounting rows, fusion tickets, runoffs, Kansas City, unopposed races, and so on) are documented in `CODE/scripts/build-past-results.mjs`.
