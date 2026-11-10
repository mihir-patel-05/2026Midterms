# Nightly logical backup of the main database (issue #190). The major version must be at least the
# source server's (Railway's postgres-ssl:18), or pg_dump refuses to run.
FROM postgres:18-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends awscli ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY backup.sh /usr/local/bin/db-backup
# Not a server: run the backup once and exit (Railway runs it as a cron service).
ENTRYPOINT []
CMD ["/usr/local/bin/db-backup"]
