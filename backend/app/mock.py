from __future__ import annotations

WILDFIRE_STATUS = {
    "level": "critical",
    "advisory": "Red Flag warning across Los Angeles, Ventura, and Santa Barbara counties. Expect shifting winds.",
    "active_fires": 3,
    "counties": ["Los Angeles", "Ventura", "Santa Barbara"],
    "updated_at": "2026-04-11T18:00:00Z",
}

MOCK_ROUTES = {
    "recommended": {
        "id": "us-101",
        "name": "US-101 Coastal",
        "distance_miles": 92.4,
        "duration_minutes": 108.0,
        "risk": "low",
        "segments": [
            {
                "name": "Downtown LA to Ventura",
                "distance_miles": 65.2,
                "duration_minutes": 72.0,
                "risk": "low",
            },
            {
                "name": "Ventura to Santa Barbara",
                "distance_miles": 27.2,
                "duration_minutes": 36.0,
                "risk": "low",
            },
        ],
        "geometry": {
            "type": "LineString",
            "coordinates": [
                [-118.2437, 34.0522],
                [-119.2965, 34.2819],
                [-119.6982, 34.4208],
            ],
        },
    },
    "alternatives": [
        {
            "id": "ca-14",
            "name": "CA-14 High Desert",
            "distance_miles": 110.6,
            "duration_minutes": 130.0,
            "risk": "moderate",
            "segments": [
                {
                    "name": "Downtown LA to Palmdale",
                    "distance_miles": 62.5,
                    "duration_minutes": 78.0,
                    "risk": "moderate",
                },
                {
                    "name": "Palmdale to Santa Clarita",
                    "distance_miles": 48.1,
                    "duration_minutes": 52.0,
                    "risk": "moderate",
                },
            ],
            "geometry": {
                "type": "LineString",
                "coordinates": [
                    [-118.2437, 34.0522],
                    [-118.1445, 34.2000],
                    [-118.1250, 34.5000],
                    [-118.5375, 34.3917],
                ],
            },
        }
    ],
}

OVERLAY_GEOJSON = {
    "fire_perimeters": {
        "id": "fire_perimeters",
        "name": "Fire Perimeters",
        "category": "fire",
        "data": {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"name": "Topanga Canyon"},
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [
                            [
                                [-118.650, 34.120],
                                [-118.600, 34.120],
                                [-118.600, 34.070],
                                [-118.650, 34.070],
                                [-118.650, 34.120],
                            ]
                        ],
                    },
                }
            ],
        },
    },
}

OVERLAY_GEOJSON["evacuation_zones"] = {
    "id": "evacuation_zones",
    "name": "Evacuation Zones",
    "category": "evacuation",
    "data": {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": "Topanga Canyon Zone A",
                    "zone_id": "TC-A",
                    "status": "mandatory",
                    "issued_at": "2026-04-11T16:00:00Z",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-118.670, 34.130],
                            [-118.590, 34.130],
                            [-118.590, 34.060],
                            [-118.670, 34.060],
                            [-118.670, 34.130],
                        ]
                    ],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "name": "Calabasas Advisory Zone",
                    "zone_id": "CAL-1",
                    "status": "voluntary",
                    "issued_at": "2026-04-11T17:30:00Z",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-118.670, 34.170],
                            [-118.590, 34.170],
                            [-118.590, 34.130],
                            [-118.670, 34.130],
                            [-118.670, 34.170],
                        ]
                    ],
                },
            },
        ],
    },
}

OVERLAY_GEOJSON["smoke_plumes"] = {
    "id": "smoke_plumes",
    "name": "Smoke Plumes",
    "category": "smoke",
    "data": {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "name": "Topanga Smoke Plume",
                    "density": "heavy",
                    "satellite": "GOES-18",
                    "observed_at": "2026-04-11T17:00:00Z",
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [-118.700, 34.150],
                            [-118.550, 34.200],
                            [-118.400, 34.180],
                            [-118.450, 34.100],
                            [-118.600, 34.080],
                            [-118.700, 34.150],
                        ]
                    ],
                },
            },
        ],
    },
}

LIVE_UPDATES = [
    {
        "id": "update-1",
        "category": "fire",
        "severity": "critical",
        "message": "Mulholland wildfire jumped containment line near Topanga Canyon.",
        "timestamp": "2026-04-11T18:05:00Z",
    },
    {
        "id": "update-2",
        "category": "road",
        "severity": "moderate",
        "message": "US-101 westbound shoulder closed near Thousand Oaks for fire crews.",
        "timestamp": "2026-04-11T17:55:00Z",
    },
    {
        "id": "update-3",
        "category": "evac",
        "severity": "high",
        "message": "Voluntary evacuations expanded to Calabasas north of Parkway Calabasas.",
        "timestamp": "2026-04-11T17:40:00Z",
    },
    {
        "id": "update-4",
        "category": "shelter",
        "severity": "info",
        "message": "Ventura County Fairgrounds opened an additional 150 beds.",
        "timestamp": "2026-04-11T17:20:00Z",
    },
    {
        "id": "update-5",
        "category": "fire",
        "severity": "high",
        "message": "New spot fire detected near Santa Clarita — crews en route.",
        "timestamp": "2026-04-11T17:10:00Z",
    },
]
