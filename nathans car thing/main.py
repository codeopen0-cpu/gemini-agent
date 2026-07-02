import subprocess
import time

def start_services():
    nodes = ["thermal_node.py", "engine.py"]
    processes = [subprocess.Popen(["python", node]) for node in nodes]
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        for p in processes: p.terminate()

if __name__ == "__main__":
    start_services()
