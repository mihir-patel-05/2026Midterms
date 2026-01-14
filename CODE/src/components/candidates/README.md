# CandidateCard Component

Reusable component for displaying candidate information in a card format.

## Usage

```tsx
import { CandidateCard } from '@/components/candidates';
import useCandidates from '@/hooks/useCandidates';

function CandidatesList() {
  const { candidates, loading, error } = useCandidates({
    state: 'CA',
    includeFunds: true,
  });

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {candidates.map((candidate) => (
        <CandidateCard key={candidate.id} candidate={candidate} />
      ))}
    </div>
  );
}
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `candidate` | `Candidate` | required | Candidate data object |
| `className` | `string` | `""` | Additional CSS classes for customization |
| `showIdeologyScore` | `boolean` | `false` | Whether to display ideology score if available |

## Features

- **Avatar with Initials** - Displays candidate initials in a circular avatar
- **Party Badge** - Color-coded badge showing party affiliation (D/R/I)
- **Incumbent Badge** - Shows "Incumbent" badge when applicable
- **Funds Raised** - Displays formatted fundraising amount (e.g., "$4.2M")
- **Ideology Score** - Optional display of ideology score with gradient bar
- **Responsive** - Works on mobile, tablet, and desktop
- **Hover Effects** - Smooth shadow and border animations on hover
- **Clickable** - Entire card links to `/candidates/:id` detail page

## Examples

### Basic Usage

```tsx
<CandidateCard candidate={candidate} />
```

### With Ideology Score

```tsx
<CandidateCard candidate={candidate} showIdeologyScore={true} />
```

### Custom Styling

```tsx
<CandidateCard
  candidate={candidate}
  className="max-w-sm"
/>
```

### Grid Layout

```tsx
<div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
  {candidates.map((candidate) => (
    <CandidateCard key={candidate.id} candidate={candidate} />
  ))}
</div>
```

## Design

Matches the card design from `FeaturedCandidates.tsx`:
- Rounded corners with border
- Two-section layout (header + stats)
- Consistent spacing and typography
- Non-partisan color scheme
- Smooth transitions

## Data Requirements

The component expects a `Candidate` object with the following fields:
- `id` - Unique identifier (required)
- `name` - Candidate name (required)
- `office` - "HOUSE" or "SENATE" (required)
- `state` - Two-letter state code (required)
- `party` - Party affiliation (optional)
- `district` - Congressional district for House (optional)
- `incumbentStatus` - "I" for incumbent (optional)
- `incumbent` - Boolean incumbent flag (optional, computed field)
- `totalFundsRaised` - Total funds raised in dollars (optional)
- `ideologyScores` - Array of ideology score objects (optional)
