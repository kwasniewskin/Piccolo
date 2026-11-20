namespace Piccolo.Api.Models;

/// <summary>
/// Meal slot in the food diary.
/// Serialized as kebab-case in JSON (e.g. SecondBreakfast -> "second-breakfast").
/// </summary>
public enum MealType
{
    Breakfast,
    SecondBreakfast,
    Lunch,
    Snack,
    Dinner
}
