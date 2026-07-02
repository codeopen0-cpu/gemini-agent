import time
import paho.mqtt.client as mqtt
class SensorNode:
def init(self, node_id, topic):
self.node_id = node_id
self.topic = topic
self.client = mqtt.Client()
self.client.connect("localhost", 1883, 60)
def publish_data(self, data):
self.client.publish(self.topic, str(data))
if name == "main":
radar = SensorNode("RADAR_01", "/sensors/radar/range")
while True:
distance = 15.5
radar.publish_data(distance)
time.sleep(0.1)