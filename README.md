# Confirm NHCC golfers posted on days they played


### Obtain USGA Reports
* Download the report from the "Played / Posted Report (Players)" from USGA Admin portal
* Rename the file to usga-mm-dd-yyyy
* Move it to the folder "usgaReports"

### Update Docker Container
* docker build -t handicapcheck .

### Run the python script in docker container
* docker run --env-file .env -v $(pwd)/usgaReports:/usgaReports -v $(pwd)/reports:/reports handicapcheck mm-dd-yy


### To Do List
* Publish the report of non-posters outside of terminal