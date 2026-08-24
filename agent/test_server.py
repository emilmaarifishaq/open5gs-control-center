import unittest
from pathlib import Path
import sys
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
import server
import tempfile


class HealthTests(unittest.TestCase):
    @patch("server.prometheus_health", return_value={"available": False})
    @patch("server.service_health", return_value=("healthy", 4))
    def test_all_healthy(self, mocked_health, _mocked_metrics):
        payload = server.build_health()
        self.assertEqual(payload["coreStatus"], "healthy")
        self.assertEqual(len(payload["networkFunctions"]), 20)
        self.assertEqual(payload["networkFunctions"][0]["name"], "UERANSIM gNB")
        mocked_health.assert_called()

    @patch("server.prometheus_health", return_value={"available": False})
    @patch("server.service_health", side_effect=[("healthy", 2)] * 19 + [("unavailable", 2)] + [("healthy", 2)] * 2)
    def test_one_unavailable_is_degraded(self, _mocked_health, _mocked_metrics):
        self.assertEqual(server.build_health()["coreStatus"], "degraded")

    def test_parses_prometheus_text_format(self):
        values = server._prometheus_values("# HELP ues_active Active UEs\nues_active{plmn=\"00101\"} 2\nues_active{plmn=\"99970\"} 3\nprocess_cpu_seconds_total 1.25\n")
        self.assertEqual(values["ues_active"], 5)
        self.assertEqual(values["process_cpu_seconds_total"], 1.25)

    @patch("server.urllib.request.urlopen")
    def test_collects_prometheus_summary(self, mocked_open):
        class Response:
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def read(self, _limit):
                return b"ues_active 4\nfivegs_smffunction_sm_sessionnbr 3\nprocess_resident_memory_bytes 1024\nprocess_cpu_seconds_total 2.5\n"
        mocked_open.return_value = Response()
        payload = server.prometheus_health()
        self.assertTrue(payload["available"])
        self.assertEqual(payload["availableSources"], 3)
        self.assertEqual(payload["activeUes"], 12)
        self.assertEqual(payload["pduSessions"], 9)

    def test_reads_only_allowlisted_node_files(self):
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8") as config:
            config.write("amf:\n  sbi:\n")
            config.flush()
            with patch.dict(server.NODE_FILES, {"test": (config.name, config.name)}):
                payload = server.read_node_file("test", "config")
                self.assertTrue(payload["available"])
                self.assertIn("amf:", payload["content"])
        self.assertIsNone(server.read_node_file("../../etc/passwd", "config"))

    def test_rejects_unallowlisted_config_apply(self):
        status, payload = server.apply_node_config("../../etc/passwd", "test: true\n")
        self.assertEqual(status, 400)
        self.assertFalse(payload["ok"])

    @patch("server.subprocess.run")
    def test_reads_ueransim_logs_from_journal(self, mocked_run):
        mocked_run.return_value.returncode = 0
        mocked_run.return_value.stdout = "UERANSIM gNB started\n"
        payload = server.read_node_file("gnb", "logs")
        self.assertTrue(payload["available"])
        self.assertIn("UERANSIM", payload["content"])
        mocked_run.assert_called_once_with(
            ["journalctl", "-u", "ueransim-gnb", "-n", "200", "--no-pager", "--output=short-iso"],
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )

    @patch("server._configured_ueransim_ip", return_value="127.0.0.1")
    @patch("server.subprocess.run")
    def test_detects_ueransim_sctp_association(self, mocked_run, _mocked_ip):
        mocked_run.return_value.returncode = 0
        mocked_run.return_value.stdout = "ESTAB 0 0 127.0.0.1:41234 127.0.0.5:38412\n"
        interfaces = server.access_interface_health()
        self.assertEqual(interfaces[0]["status"], "connected")
        self.assertEqual(interfaces[0]["peerAddress"], "127.0.0.1")
        self.assertEqual(interfaces[1]["status"], "disconnected")


if __name__ == "__main__":
    unittest.main()
