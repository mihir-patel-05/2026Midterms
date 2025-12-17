/**
 * Candidates Page - Displays list of all candidates with real data
 * Uses useCandidates hook to fetch from API and CandidateCard component to display
 */
import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { CandidateCard } from "@/components/candidates";
import useCandidates from "@/hooks/useCandidates";
import { Loader2, AlertCircle, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination";

export default function CandidatesPage() {
  const [currentPage, setCurrentPage] = useState(1);
  // Fetch candidates from API with funding data
  const { candidates, loading, error, refetch, pagination } = useCandidates({
    includeFunds: true,
    perPage: 50,
    page: currentPage,
  });

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo(0, 0); // Scroll to top on page change
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
                There are no candidates in the database yet. Check back later or try syncing data from the FEC API.
              </p>
              <Button onClick={() => refetch()} variant="outline">
                Refresh
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
                    {candidates.length}
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
                    showIdeologyScore={false}
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
