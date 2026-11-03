using System.ComponentModel.DataAnnotations;

namespace Piccolo.Api.Models;

/// <summary>
/// Dzienne cele kaloryczne i makroskładników użytkownika.
/// Zakresy zgodne z walidacją formularza w ustawieniach (settings-page.tsx).
/// </summary>
public class GoalsDto
{
    [Range(0, 10000)]
    public double Kcal { get; set; }

    [Range(0, 1000)]
    public double Protein { get; set; }

    [Range(0, 1000)]
    public double Fat { get; set; }

    [Range(0, 1000)]
    public double Carbs { get; set; }

    public static GoalsDto FromUser(User user) => new()
    {
        Kcal = user.CalorieGoal,
        Protein = user.ProteinGoal,
        Fat = user.FatGoal,
        Carbs = user.CarbsGoal
    };
}
