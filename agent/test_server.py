import unittest
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import server


class HealthTests(unittest.TestCase):
    @patch("server.service_health", return_value=("healthy", 4))
    def test_all_healthy(self, mocked_health):
        payload = server.build_health()
        self.assertEqual(payload["coreStatus"], "healthy")
        self.assertEqual(len(payload["networkFunctions"]), 12)
        self.assertEqual(payload["networkFunctions"][0]["name"], "AMF")
        mocked_health.assert_called()

    @patch("server.service_health", side_effect=[("healthy", 2)] * 11 + [("unavailable", 2)])
    def test_one_unavailable_is_degraded(self, _mocked_health):
        self.assertEqual(server.build_health()["coreStatus"], "degraded")


if __name__ == "__main__":
    unittest.main()
