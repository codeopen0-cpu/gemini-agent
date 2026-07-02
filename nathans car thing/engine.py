import paho.mqtt.client as mqtt
import yaml

with open("config.yaml", "r") as f:
    config = yaml.safe_load(f)

def on_message(client, userdata, msg):
    payload = msg.payload.decode()
    if "animal" in payload:
        client.publish(config['mqtt']['topics']['countermeasure'], "STROBE_ULTRASONIC_ACTIVATE")
    elif "human" in payload:
        client.publish(config['mqtt']['topics']['countermeasure'], "TACTICAL_OFFLINE")

client = mqtt.Client()
client.on_message = on_message
client.connect(config['mqtt']['broker'], config['mqtt']['port'])
client.subscribe("#")
client.loop_forever()
