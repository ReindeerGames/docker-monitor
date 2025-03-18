# Docker Monitor

A lightweight Node.js application that monitors Docker containers (and optionally Swarm services), sending email alerts when issues are detected. It checks container states and health, notifying you via styled HTML emails with Docker branding—once when an issue occurs and a reminder after 1 hour if unresolved.

Built with dockerode and nodemailer, it runs in a Docker container and uses the Docker socket for efficient monitoring.

## Features

* Monitors all Docker containers for stopped or unhealthy states.
* Optional Docker Swarm service monitoring (skipped if Swarm isn't active).
* Sends two emails per issue: an initial alert and a 1-hour reminder.
* Styled HTML emails with Docker logo, icons (red X for errors, green check for healthy), and a clean table layout.
* Configurable via environment variables (SMTP, check interval, etc.).
* Timezone-aware timestamps (default: SAST, adjustable).

## Prerequisites

* Docker and Docker Compose installed.
* Access to an SMTP server (e.g., Gmail, custom mail server).
* A Docker host with containers to monitor.

## Installation

### Clone the Repository

```bash
git clone https://github.com/ReindeerGames/docker-monitor.git
cd docker-monitor
```

### Build the Image

```bash
docker build -t docker-monitor .
```

### Configure Environment Variables

Edit docker-compose.yml with your SMTP settings and preferences:

```yaml
version: '3.8'
services:
  docker-monitor:
    image: docker-monitor:latest
    container_name: docker-monitor
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - EMAIL_HOST=mail.yourdomain.com
      - EMAIL_PORT=465
      - EMAIL_SECURE=true
      - EMAIL_USER=your-email@yourdomain.com
      - EMAIL_PASS=your-password
      - EMAIL_TO=recipient@yourdomain.com
      - CHECK_INTERVAL=60000 # Check every 60 seconds (in ms)
      - TZ=Africa/Johannesburg # Set your timezone
    restart: unless-stopped
```

* EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE: Your SMTP server details.
* EMAIL_USER, EMAIL_PASS: SMTP credentials (use an App Password for Gmail with 2FA).
* EMAIL_TO: Where alerts are sent.
* CHECK_INTERVAL: How often to check (in milliseconds).
* TZ: Timezone for timestamps (see IANA Time Zone Database for options).

### Deploy

```bash
docker-compose up -d
```

## Usage

* **Monitor Containers**: The app automatically checks all containers via the Docker socket.
* **Test Alerts**: Stop a container to trigger an email:
  ```bash
  docker stop <container_name>
  ```
  Expect an alert within 60 seconds and a reminder after 1 hour if still down.
* **View Logs**: Check the app's activity:
  ```bash
  docker logs docker-monitor
  ```

## Example Email

*(Placeholder - add your screenshot!)*

* **Initial Alert**: Sent when a container stops or becomes unhealthy.
* **Reminder**: Sent 1 hour later if the issue persists.

## Customization

* **Email Styling**: Edit index.js (emailHeader, emailFooter) to change the logo, colors, or layout.
* **Timezone**: Adjust TZ in docker-compose.yml or modify getTimestamp() in index.js.
* **Notification Timing**: Change oneHour in index.js (default: 60 * 60 * 1000 ms) for a different reminder interval.

## Contributing

1. Fork the repo.
2. Create a feature branch:
   ```bash
   git checkout -b feature/your-idea
   ```
3. Commit changes:
   ```bash
   git commit -m "Add your feature"
   ```
4. Push to your fork:
   ```bash
   git push origin feature/your-idea
   ```
5. Open a Pull Request.

Ideas:
* Add support for Slack or SMS notifications.
* Filter specific containers to monitor.
* Enhance styling or add more status details.

## License

MIT License - Free to use, modify, and distribute.

## Acknowledgments

* Built with dockerode and nodemailer.
* Inspired by the need for simple, effective Docker monitoring.