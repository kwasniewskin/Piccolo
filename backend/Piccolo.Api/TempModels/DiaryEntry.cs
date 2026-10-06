using System;
using System.Collections.Generic;

namespace Piccolo.Api.TempModels;

public partial class DiaryEntry
{
    public int Id { get; set; }

    public double AmountInGrams { get; set; }

    public string Date { get; set; } = null!;

    public int MealType { get; set; }

    public int ProductId { get; set; }

    public int UserId { get; set; }

    public virtual Product Product { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
