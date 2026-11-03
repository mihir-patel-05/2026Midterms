# War Room landing page: plain static files served by nginx. No build step.
FROM nginx:alpine

COPY index.html styles.css app.js favicon.svg robots.txt /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/templates/default.conf.template

# Railway injects PORT at runtime. WAR_ROOM_URL is where every Launch button goes (no trailing slash; module links
# add /map, /night and so on). SITE_URL is the main VoteInformed site. Override either as a Railway variable.
ENV PORT=80 \
    WAR_ROOM_URL=https://2026midterms-testing.up.railway.app/war-room \
    SITE_URL=https://2026midterms-testing.up.railway.app
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
