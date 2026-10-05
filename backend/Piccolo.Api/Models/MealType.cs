namespace Piccolo.Api.Models;

/// <summary>
/// Pora posiłku w dzienniku żywieniowym.
/// Wartości są konwertowane do kebab-case w JSON (np. SecondBreakfast -> "second-breakfast").
/// </summary>
public enum MealType
{
    Breakfast,
    SecondBreakfast,
    Lunch,
    Snack,
    Dinner
}
