using System;
using System.Collections.Generic;

namespace Piccolo.Api.TempModels;

public partial class Product
{
    public int Id { get; set; }

    public string Name { get; set; } = null!;

    public double CaloriesPer100g { get; set; }

    public double ProteinPer100g { get; set; }

    public double FatPer100g { get; set; }

    public double CarbsPer100g { get; set; }

    public string? Barcode { get; set; }

    public virtual ICollection<DiaryEntry> DiaryEntries { get; set; } = new List<DiaryEntry>();
}
