import subprocess
import timedef start_services():
nodes = ["thermal_node.py", "engine.py"]
processes = [subprocess.Popen(["python", node]) for node in nodes]
try:
while True:
time.sleep(1)
except KeyboardInterrupt:
for p in processes: p.terminate()if name == "main":
start_services()Would you like me to adjust the GPIO pin definitions in the engine.py logic to interface with the relays on your Raspberry Pi 5?