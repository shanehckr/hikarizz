from backend.main import calc_risk


def test_calc_risk_caps_score_at_100_for_large_expired_metal_quarry():
    row = {
        "area_hectares": 500,
        "commodity": "Gold, silver, copper",
        "status": "expired",
        "remarks": "suspended operation",
    }

    assert calc_risk(row) == 100
