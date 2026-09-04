#!/usr/bin/env python3
"""
Adaptive Event-Processing Pipeline — External Traffic Generator
Generates synthetic e-commerce traffic and dispatches HTTP POST requests to the Express ingestion API.
"""

import argparse
import json
import random
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
import urllib.request
import urllib.error

# E-commerce Event Distribution:
# 10% PAYMENT (Critical), 10% ORDER (Critical), 20% INVENTORY (High), 35% CLICK (Low), 25% LOG (Low)
EVENT_TYPES = ['PAYMENT', 'ORDER', 'INVENTORY', 'CLICK', 'LOG']
EVENT_WEIGHTS = [0.10, 0.10, 0.20, 0.35, 0.25]

SCENARIO_RATES = {
    'normal': 1000,      # ~1,000 events/min (~16.7 events/sec)
    'spike': 20000,     # ~20,000 events/min (~333.3 events/sec)
    'recovery': 1000,   # ~1,000 events/min (~16.7 events/sec)
}

class TrafficGenerator:
    def __init__(self, endpoint: str, rate_per_min: int, duration_sec: int, scenario_name: str, concurrency: int = 20):
        self.endpoint = endpoint
        self.rate_per_min = rate_per_min
        self.rate_per_sec = rate_per_min / 60.0
        self.duration_sec = duration_sec
        self.scenario_name = scenario_name
        self.concurrency = concurrency

        # Telemetry counters
        self.attempted = 0
        self.accepted = 0
        self.failed = 0
        self.broker_unavailable = 0
        self.start_time = 0.0

    def generate_event(self) -> dict:
        event_type = random.choices(EVENT_TYPES, weights=EVENT_WEIGHTS, k=1)[0]
        now_ms = int(time.time() * 1000)
        event_id = f"ext_{uuid.uuid4().hex[:10]}"

        payload = {
            "userId": f"usr_{random.randint(1000, 9999)}",
        }
        if event_type in ('ORDER', 'PAYMENT'):
            payload["amount"] = round(random.uniform(15.0, 450.0), 2)
            payload["currency"] = "USD"
        elif event_type == 'INVENTORY':
            payload["itemSku"] = f"SKU_{random.randint(100, 999)}"
            payload["quantityChange"] = random.choice([-1, -2, 5, 10])
        elif event_type == 'CLICK':
            payload["page"] = random.choice(["/product/123", "/cart", "/checkout", "/home", "/deals"])
        elif event_type == 'LOG':
            payload["level"] = random.choice(["INFO", "DEBUG", "WARN"])
            payload["service"] = "frontend-web"

        return {
            "id": event_id,
            "type": event_type,
            "timestamp": now_ms,
            "payload": payload,
        }

    def send_event(self, event: dict) -> bool:
        data = json.dumps(event).encode('utf-8')
        req = urllib.request.Request(
            self.endpoint,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Python-TrafficGenerator/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=3.0) as resp:
                if resp.status in (200, 202):
                    self.accepted += 1
                    return True
                else:
                    self.failed += 1
                    return False
        except urllib.error.HTTPError as e:
            if e.code == 503:
                self.broker_unavailable += 1
            self.failed += 1
            return False
        except Exception:
            self.failed += 1
            return False

    def run(self):
        print("=" * 65)
        print("  ADAPTIVE EVENT PIPELINE — EXTERNAL TRAFFIC GENERATOR")
        print("=" * 65)
        print(f"  Target Endpoint : {self.endpoint}")
        print(f"  Scenario        : {self.scenario_name.upper()}")
        print(f"  Target Rate     : {self.rate_per_min:,} events/min ({self.rate_per_sec:.1f} events/sec)")
        print(f"  Duration        : {self.duration_sec} seconds")
        print(f"  Concurrency     : {self.concurrency} worker threads")
        print("=" * 65)
        print("Starting traffic generation... Press Ctrl+C to abort.\n")

        self.start_time = time.time()
        end_time = self.start_time + self.duration_sec
        interval = 0.05  # 50ms tick
        events_per_tick = max(1, round(self.rate_per_sec * interval))

        with ThreadPoolExecutor(max_workers=self.concurrency) as executor:
            try:
                while time.time() < end_time:
                    tick_start = time.time()

                    # Dispatch batch for current tick
                    events = [self.generate_event() for _ in range(events_per_tick)]
                    self.attempted += len(events)
                    for ev in events:
                        executor.submit(self.send_event, ev)

                    elapsed = time.time() - self.start_time
                    actual_rate_min = (self.attempted / elapsed) * 60.0 if elapsed > 0 else 0

                    # Live status display in terminal
                    sys.stdout.write(
                        f"\r[{elapsed:4.1f}s / {self.duration_sec}s] "
                        f"Attempted: {self.attempted:<6} | "
                        f"Accepted (202): {self.accepted:<6} | "
                        f"Failed: {self.failed:<4} | "
                        f"Rate: {actual_rate_min:6.0f}/min"
                    )
                    sys.stdout.flush()

                    # Sleep remaining tick time
                    tick_elapsed = time.time() - tick_start
                    sleep_time = max(0.0, interval - tick_elapsed)
                    if sleep_time > 0:
                        time.sleep(sleep_time)

            except KeyboardInterrupt:
                print("\n\n[ABORTED] Generator interrupted by user.")

        total_elapsed = max(0.1, time.time() - self.start_time)
        print("\n\n" + "=" * 65)
        print("  RUN SUMMARY")
        print("=" * 65)
        print(f"  Elapsed Time          : {total_elapsed:.2f} seconds")
        print(f"  Total Attempted       : {self.attempted:,}")
        print(f"  Successfully Accepted : {self.accepted:,} ({(self.accepted / max(1, self.attempted) * 100):.1f}%)")
        print(f"  Failed (Total)        : {self.failed:,}")
        if self.broker_unavailable > 0:
            print(f"  Kafka Unavailable(503): {self.broker_unavailable:,} (Broker not running)")
        print(f"  Effective Sending Rate: {(self.attempted / total_elapsed) * 60.0:,.0f} events/min")
        print("=" * 65 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="External traffic generator for Adaptive Event-Processing Pipeline."
    )
    parser.add_argument(
        '--scenario',
        type=str,
        choices=['normal', 'spike', 'recovery', 'custom'],
        default='normal',
        help="Traffic scenario: normal (~1,000/min), spike (~20,000/min), recovery (~1,000/min)",
    )
    parser.add_argument(
        '--rate',
        type=int,
        default=None,
        help="Custom rate in events per minute (overrides scenario rate)",
    )
    parser.add_argument(
        '--duration',
        type=int,
        default=30,
        help="Run duration in seconds (default: 30s)",
    )
    parser.add_argument(
        '--endpoint',
        type=str,
        default='http://localhost:4000/api/ingest',
        help="Ingestion endpoint URL (default: http://localhost:4000/api/ingest)",
    )
    parser.add_argument(
        '--concurrency',
        type=int,
        default=25,
        help="HTTP worker threads (default: 25)",
    )

    args = parser.parse_args()

    # Determine rate
    if args.rate is not None:
        rate = args.rate
        scenario_name = f"custom ({rate}/min)"
    else:
        rate = SCENARIO_RATES.get(args.scenario, 1000)
        scenario_name = args.scenario

    generator = TrafficGenerator(
        endpoint=args.endpoint,
        rate_per_min=rate,
        duration_sec=args.duration,
        scenario_name=scenario_name,
        concurrency=args.concurrency,
    )
    generator.run()


if __name__ == '__main__':
    main()
