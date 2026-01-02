/**
 * Candidates Page - Displays list of all candidates with real data
 * Uses useCandidates hook to fetch from API and CandidateCard component to display
 */
import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { CandidateCard } from "@/components/candidates";
import useCandidates from "@/hooks/useCandidates";
import { Loader2, AlertCircle, Users, SlidersHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

const usStates = [
  { value: "AL", label: "Alabama" }, { value: "AK", label: "Alaska" }, { value: "AZ", label: "Arizona" },
  { value: "AR", label: "Arkansas" }, { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
  { value: "CT", label: "Connecticut" }, { value: "DE", label: "Delaware" }, { value: "FL", label: "Florida" },
  { value: "GA", label: "Georgia" }, { value: "HI", label: "Hawaii" }, { value: "ID", label: "Idaho" },
  { value: "IL", label: "Illinois" }, { value: "IN", label: "Indiana" }, { value: "IA", label: "Iowa" },
  { value: "KS", label: "Kansas" }, { value: "KY", label: "Kentucky" }, { value: "LA", label: "Louisiana" },
  { value: "ME", label: "Maine" }, { value: "MD", label: "Maryland" }, { value: "MA", label: "Massachusetts" },
  { value: "MI", label: "Michigan" }, { value: "MN", label: "Minnesota" }, { value: "MS", label: "Mississippi" },
  { value: "MO", label: "Missouri" }, { value: "MT", label: "Montana" }, { value: "NE", label: "Nebraska" },
  { value: "NV", label: "Nevada" }, { value: "NH", label: "New Hampshire" }, { value: "NJ", label: "New Jersey" },
  { value: "NM", label: "New Mexico" }, { value: "NY", label: "New York" }, { value: "NC", label: "North Carolina" },
  { value: "ND", label: "North Dakota" }, { value: "OH", label: "Ohio" }, { value: "OK", label: "Oklahoma" },
  { value: "OR", label: "Oregon" }, { value: "PA", label: "Pennsylvania" }, { value: "RI", label: "Rhode Island" },
  { value: "SC", label: "South Carolina" }, { value: "SD", label: "South Dakota" }, { value: "TN", label: "Tennessee" },
  { value: "TX", label: "Texas" }, { value: "UT", label: "Utah" }, { value: "VT", label: "Vermont" },
  { value: "VA", label: "Virginia" }, { value: "WA", label: "Washington" }, { value: "WV", label: "West Virginia" },
  { value: "WI", label: "Wisconsin" }, { value: "WY", label: "Wyoming" }
];


export default function CandidatesPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<string | undefined>(undefined);
  const [officeFilter, setOfficeFilter] = useState<string | undefined>(undefined);

  // Fetch candidates from API with funding data
  const { candidates, loading, error, refetch, pagination } = useCandidates({
    search: searchQuery || undefined,
    includeFunds: true,
    // Only show candidates running in the 2026 midterms
    cycle: 2026,
    perPage: 50,
    page: currentPage,
    state: stateFilter,
    office: officeFilter,
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo(0, 0); // Scroll to top on page change
  };

  const handleFilterChange = () => {
    setCurrentPage(1);
  };
  
  const clearFilters = () => {
    setSearchQuery("");
    setStateFilter(undefined);
    setOfficeFilter(undefined);
    setCurrentPage(1);
  };

  // Helper to render page links
  const renderPageLinks = () => {
    if (!pagination) return null;

    const pageLinks = [];
    const totalPages = pagination.totalPages;
    const page = pagination.page;

    // Previous button
    pageLinks.push(
      <PaginationItem key="prev">
        <PaginationPrevious
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (pagination.hasPrev) handlePageChange(page - 1);
          }}
          className={!pagination.hasPrev ? "pointer-events-none text-muted-foreground" : ""}
        />
      </PaginationItem>
    );

    // Page number links
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pageLinks.push(
          <PaginationItem key={i}>
            <PaginationLink href="#" onClick={(e) => {e.preventDefault(); handlePageChange(i)}} isActive={i === page}>
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
    } else {
      // First page
      pageLinks.push(
        <PaginationItem key={1}>
          <PaginationLink href="#" onClick={(e) => {e.preventDefault(); handlePageChange(1)}} isActive={1 === page}>
            1
          </PaginationLink>
        </PaginationItem>
      );

      if (page > 3) {
        pageLinks.push(<PaginationEllipsis key="start-ellipsis" />);
      }

      let start = Math.max(2, page - 1);
      let end = Math.min(totalPages - 1, page + 1);

      if (page === totalPages) {
        start = totalPages - 3;
        end = totalPages -1;
      }
      if (page === 1) {
        start = 2;
        end = 4;
      }


      for (let i = start; i <= end; i++) {
        pageLinks.push(
          <PaginationItem key={i}>
            <PaginationLink href="#" onClick={(e) => {e.preventDefault(); handlePageChange(i)}} isActive={i === page}>
              {i}
            </PaginationLink>
          </PaginationItem>
        );
      }
       if (page < totalPages - 2) {
        pageLinks.push(<PaginationEllipsis key="end-ellipsis" />);
      }
      // Last page
      pageLinks.push(
        <PaginationItem key={totalPages}>
          <PaginationLink href="#" onClick={(e) => {e.preventDefault(); handlePageChange(totalPages)}} isActive={totalPages === page}>
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      );
    }



    // Next button
    pageLinks.push(
      <PaginationItem key="next">
        <PaginationNext
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (pagination.hasNext) handlePageChange(page + 1);
          }}
          className={!pagination.hasNext ? "pointer-events-none text-muted-foreground" : ""}
        />
      </PaginationItem>
    );

    return pageLinks;
  };


  return (
    <Layout>
      {/* Hero Section */}
      <section className="bg-muted/30 border-b border-border">
        <div className="container py-8">
          <h1 className="font-heading text-3xl font-bold text-foreground sm:text-4xl">
            All Candidates
          </h1>
          <p className="mt-2 text-muted-foreground">
            Explore candidate profiles with campaign funding and background information.
          </p>
        </div>
      </section>

       {/* Filters Section */}
      <section className="border-b border-border sticky top-16 bg-background/95 z-40 backdrop-blur-sm">
        <div className="container py-4">
          <div className="flex flex-wrap items-center gap-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filters
            </h3>

            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search candidates..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  handleFilterChange();
                }}
                className="pl-9"
              />
            </div>

            {/* State Filter */}
            <Select value={stateFilter || 'ALL'} onValueChange={(value) => {setStateFilter(value === 'ALL' ? undefined : value); handleFilterChange()}}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All States" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All States</SelectItem>
                {usStates.map((state) => (
                  <SelectItem key={state.value} value={state.value}>{state.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Office Filter */}
            <Select value={officeFilter || 'ALL'} onValueChange={(value) => {setOfficeFilter(value === 'ALL' ? undefined : value); handleFilterChange()}}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Offices" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Offices</SelectItem>
                <SelectItem value="HOUSE">House</SelectItem>
                <SelectItem value="SENATE">Senate</SelectItem>
              </SelectContent>
            </Select>

            {(searchQuery || stateFilter || officeFilter) && (
              <Button variant="ghost" onClick={clearFilters} className="text-sm">
                Clear Filters
              </Button>
            )}

          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-8">
        <div className="container">
          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium text-foreground">Loading candidates...</p>
              <p className="text-sm text-muted-foreground mt-2">
                Fetching data from the FEC database
              </p>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="rounded-full bg-destructive/10 p-4 mb-4">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>
              <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
                Failed to Load Candidates
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md text-center">
                {error}
              </p>
              <Button onClick={() => refetch()} variant="outline">
                Try Again
              </Button>
            </div>
          )}

          {/* Empty State */}
          {!loading && !error && candidates.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="rounded-full bg-muted p-4 mb-4">
                <Users className="h-12 w-12 text-muted-foreground" />
              </div>
              <h2 className="font-heading text-xl font-semibold text-foreground mb-2">
                No Candidates Found
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md text-center">
                No candidates match the selected filters.
              </p>
              <Button onClick={clearFilters} variant="outline">
                Clear Filters
              </Button>
            </div>
          )}

          {/* Success State - Candidate Grid */}
          {!loading && !error && candidates.length > 0 && (
            <>
              {/* Results Count */}
              <div className="mb-6 flex justify-between items-center">
                 <p className="text-sm text-muted-foreground">
                  Showing <span className="font-semibold text-foreground">
                    {pagination?.total ?? candidates.length}
                  </span> of <span className="font-semibold text-foreground">
                    {pagination?.total ?? 0}
                  </span> candidates
                </p>
              </div>

              {/* Responsive Grid: 1 column mobile, 2 tablet, 4 desktop */}
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {candidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    showIdeologyScore={true}
                  />
                ))}
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="mt-8">
                  <Pagination>
                    <PaginationContent>
                      {renderPageLinks()}
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </Layout>
  );
}
