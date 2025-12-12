#!/bin/bash

FILE="src/dashboard/server.ts"
BACKUP="src/dashboard/server.ts.backup"

# Backup
cp "$FILE" "$BACKUP"

# Fix 1: Add performance constants after allEvents declaration
sed -i '/let allEvents = \[\];/a\
\
        // PERFORMANCE LIMITS\
        const MAX_EVENTS = 30;\
        const MAX_CHART_POINTS = 20;\
        const MAX_DOM_EVENTS = 20;\
        let updateCounter = 0;' "$FILE"

# Fix 2: Add throttling at start of updateStatus
sed -i '/function updateStatus(status) {/a\
            updateCounter++;\
            if (updateCounter % 3 !== 0) return;' "$FILE"

# Fix 3: Disable animations in chartOptions
sed -i 's/maintainAspectRatio: false,/maintainAspectRatio: false,\n                animation: false,/' "$FILE"

# Fix 4: Add pointRadius: 0 to all datasets
sed -i 's/tension: 0.4,/tension: 0.4,\n                        pointRadius: 0,/' "$FILE"

# Fix 5: Change event limit to use MAX_EVENTS
sed -i 's/if (allEvents.length > 100) allEvents.pop();/if (allEvents.length > MAX_EVENTS) allEvents = allEvents.slice(0, MAX_EVENTS);/' "$FILE"

# Fix 6: Change DOM limit to use MAX_DOM_EVENTS
sed -i 's/container.children.length > 50/container.children.length > MAX_DOM_EVENTS/g' "$FILE"

# Fix 7: Change promise refresh interval
sed -i 's/setInterval(refreshPromises, 5000);/setInterval(refreshPromises, 10000);/' "$FILE"

# Fix 8: Add cleanup before </script>
sed -i '/<\/script>/i\
\
        // Periodic cleanup\
        setInterval(() => {\
            if (allEvents.length > MAX_EVENTS) {\
                allEvents = allEvents.slice(0, MAX_EVENTS);\
            }\
            updateCounter = 0;\
        }, 30000);' "$FILE"

echo "✅ All performance fixes applied!"
