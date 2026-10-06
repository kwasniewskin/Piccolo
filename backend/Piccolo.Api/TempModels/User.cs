using System;
using System.Collections.Generic;

namespace Piccolo.Api.TempModels;

public partial class User
{
    public int Id { get; set; }

    public string ClerkUserId { get; set; } = null!;

    public string Email { get; set; } = null!;

    public string? Name { get; set; }

    public string CreatedAt { get; set; } = null!;

    public virtual ICollection<DiaryEntry> DiaryEntries { get; set; } = new List<DiaryEntry>();
}
