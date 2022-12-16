var app = require('express');
var http = require('http').createServer(app);

var io = require('socket.io')(http);
var mysql = require("mysql");

var FCM = require('fcm-node');

var serverKey = 'AAAA80vckVQ:APA91bH3bbLjKG9zNSEHBENtsqC3CbFwhzVhTqBzMiI5BimcHU_k4sX_w8YwMGMwFyipfUWO9Lu2TKz0DLpz4Qm7LAbQfNI1yyNtMbUb7R5fj_aZ21IJD0IXRMoS4CHLxIvwb1sG60KA';

var fcm = new FCM(serverKey);

require('dotenv').config();


http.listen(17275, function () {
  console.log('listening on *:17275');
});


var connection = mysql.createConnection({
  host: "tudatabase.c6nhwd7hvdqv.ap-south-1.rds.amazonaws.com",
  user: "tuadmin",
  password: "tupassword",
  database: "tuweb",
  charset: 'utf8mb4'
});


class socket {

  connect() {

    connection.connect(function (err) {
      if (err) throw err;
      console.log("Connected!");
    });

    io.on('connection', function (socket) {
      console.log('a user connected');
      socket.on('disconnect', function () {
        console.log('user disconnected');
      });

      socket.on('sendTest', function (data) {
        io.emit('sendTest', data);
      });

      socket.on('sendMessage', function (data) {
        console.log('User Send Mesg');

        if (data.group_id) {
          getConversationIdByGroupId(data, function (conversation_id) {
            var time = new Date();
            var messageData = data.message;
            var sql = 'SELECT * FROM conversation WHERE (id=?)';
            var visibleStatus = null;
            connection.query(sql, [conversation_id], function (err, result) {
              //Set visible status : null=See, 0=Not see, user_id=Single user see
              if (result && result.length) {
                if (result[0].is_sender_block == 1 && result[0].is_receiver_block == 1) {
                  visibleStatus = 0;
                } else if (result[0].is_sender_block == 1) {
                  visibleStatus = result[0].sender_id;
                } else if (result[0].is_receiver_block == 1) {
                  visibleStatus = result[0].receiver_id;
                }
              }

              var record = {
                conversation_id: conversation_id,
                sender_id: data.sender_id,
                message: messageData,
                visible: visibleStatus,
                message_type: data.type,
                created_at: time,
                thumbnailPath: data.thumbnailPath
              };

              connection.query('INSERT INTO conversation_chat SET ?', record, function (err, res) {
                if (err) throw err;
                record.id = res.insertId;
                io.emit('sendMessage', record);
                //Check notification require to send for receiver using visible(block) status 
                if (visibleStatus == data.sender_id || visibleStatus == null) {
                  var groupMembersSql = 'SELECT * FROM groups_members where group_id = ?';
                  var groupNameSql = 'SELECT * FROM groups where id =?';
                  connection.query(groupNameSql, [data.group_id], function (err, group_data) {
                    var groupName = group_data[0].group_name;
                    console.log(groupName);
                    connection.query(groupMembersSql, [data.group_id], function (err, result) {
                      result.forEach(element => {
                        var sql = 'SELECT * FROM users WHERE id = ?';
                        connection.query(sql, [data.sender_id], function (err, result1) {
                          var sender_name = result1[0].username;
                          var sender_id = result1[0].id;
                          console.log('sender_id,data.sender_id');
                          console.log(sender_id);
                          console.log(data.sender_id);
                          /* if(data.sender_id != sender_id) {*/
                          connection.query(sql, [element.member_id], function (err, result2) {
                            var receiver_device_token = result2[0].device_token;
                            if (receiver_device_token) {
                              var message = {
                                to: receiver_device_token,
                                notification: {
                                  title: sender_name,
                                  body: messageData,
                                  sound: 'default',
                                  badge: 1,
                                },
                                data: {
                                  type: data.type,
                                  receiver_id: '',
                                  group_id: data.group_id,
                                  sender_id: data.sender_id,
                                  conversation_id: conversation_id,
                                  title: sender_name,
                                  body: messageData,
                                }
                              };
                              console.log(message);
                              fcm.send(message, function (err, response) {
                                if (err) {
                                  console.log("Something has gone wrong!");
                                } else {
                                  console.log("Successfully sent with response: ", response);
                                }
                              });
                            }
                          });
                          /* }*/
                        });
                      });
                    });
                  });
                }
                console.log("Group Chat Add successfully.");
              });
            });
          });
        } else {
          get_conversation_id(data, function (conversation_id) {
            var time = new Date();
            var messageData = data.message;
            var sql = 'SELECT * FROM conversation WHERE (id=?)';
            var visibleStatus = null;
            connection.query(sql, [conversation_id], function (err, result) {
              //Set visible status : null=See, 0=Not see, user_id=Single user see
              if (result && result.length) {
                if (result[0].is_sender_block == 1 && result[0].is_receiver_block == 1) {
                  visibleStatus = 0;
                } else if (result[0].is_sender_block == 1) {
                  visibleStatus = result[0].sender_id;
                } else if (result[0].is_receiver_block == 1) {
                  visibleStatus = result[0].receiver_id;
                }
              }

              var record = {
                conversation_id: conversation_id,
                sender_id: data.sender_id,
                message: messageData,
                visible: visibleStatus,
                message_type: data.type,
                created_at: time,
                thumbnailPath: data.thumbnailPath
              };

              connection.query('INSERT INTO conversation_chat SET ?', record, function (err, res) {
                if (err) throw err;
                record.id = res.insertId;
                record.unread_count = 0;
                //var sql = 'SELECT COUNT(*) FROM conversation_chat WHERE (is_read=0)';
                connection.query('select id from conversation WHERE (sender_id = ? or receiver_id = ?) and group_id is null', [data.receiver_id, data.receiver_id], function (err, resultIds) {
                  var resultIds = JSON.stringify(resultIds);
                  console.log(resultIds);
                  var resultIds = JSON.parse(resultIds);
                  var res = "";
                  resultIds.forEach(

                    element => res = res.concat(element.id + ',')

                  );
                  res = res.replace(/,(\s+)?$/, '');
                  console.log(res);
                  resultIds = res;
                  console.log(data.receiver_id);
                  console.log(resultIds);
                  connection.query('select COUNT(*) AS unread_count FROM conversation_chat WHERE conversation_id IN (' + resultIds + ') and sender_id != ' + data.receiver_id + ' and is_read=0 group by conversation_id', [resultIds, data.receiver_id], function (err, result) {
                    if (err) throw err;

                    var string = JSON.stringify(result);
                    var json = JSON.parse(string);

                    record.unread_count = json[0].unread_count;
                    //console.log(record);

                    connection.query('select COUNT(*) AS unread_counts FROM chat_request WHERE user_id = ' + data.receiver_id + ' and status=0', [resultIds, data.receiver_id], function (err, resultRequest) {
                      var resultRequest = JSON.stringify(resultRequest);
                      var resultRequest = JSON.parse(resultRequest);

                      record.unread_count = parseInt(record.unread_count) + parseInt(resultRequest[0].unread_counts);
                      console.log(record.unread_count);
                      io.emit('sendMessage', record);
                      console.log(record);
                      //Check notification require to send for receiver using visible(block) status 
                      if (visibleStatus == data.sender_id || visibleStatus == null) {
                        var sql = 'SELECT * FROM users WHERE id = ?';
                        connection.query(sql, [data.sender_id], function (err, result) {
                          var sender_name = result[0].username;
                          connection.query(sql, [data.receiver_id], function (err, result1) {
                            var receiver_device_token = result1[0].device_token;
                            if (receiver_device_token) {
                              var message = {
                                to: receiver_device_token,
                                notification: {
                                  title: sender_name,
                                  body: messageData,
                                  sound: 'default',
                                  badge: record.unread_count,
                                },
                                data: {  //you can send only notification or only data(or include both)
                                  unread_count: record.unread_count,
                                  type: data.type,
                                  receiver_id: data.receiver_id,
                                  sender_id: data.sender_id,
                                  conversation_id: conversation_id,
                                  title: sender_name,
                                  body: messageData,
                                }
                              };
                              console.log(message);
                              fcm.send(message, function (err, response) {
                                if (err) {
                                  console.log("Something has gone wrong!");
                                } else {
                                  console.log("Successfully sent with response: ", response);
                                }
                              });
                            }

                          });
                        });
                      }
                    });
                  });
                });
                console.log("Chat Add successfully.");
              });
            });
          });
        }

        function get_conversation_id(data, callback) {
          var sid = data.sender_id;
          var rid = data.receiver_id;
          var sql = 'SELECT * FROM conversation WHERE (sender_id=? and receiver_id=?) or (sender_id=? and receiver_id=?)';
          connection.query(sql, [sid, rid, rid, sid], function (err, result) {
            if (err) throw err;
            if (result && result.length) {
              // return existing conversation_id
              return callback(result[0].id);
            } else {
              var time = new Date();
              var conversation_data = {
                sender_id: data.sender_id,
                receiver_id: data.receiver_id,
                created_at: time
              }
              connection.query('INSERT INTO conversation SET ?', conversation_data, function (err, result) {
                if (err) throw err;
                // return new created conversation_id
                return callback(result.insertId);
              });
            }
          });
        }

        function getConversationIdByGroupId(data, callback) {
          var groupId = data.group_id;
          var sql = 'SELECT * FROM conversation WHERE (group_id=?) or (group_id=?)';
          connection.query(sql, [groupId, groupId], function (err, result) {
            if (err) throw err;
            if (result && result.length) {
              // return existing conversation_id
              return callback(result[0].id);
            } else {
              var time = new Date();
              var conversation_data = {
                group_id: data.group_id,
                sender_id: data.sender_id,
                created_at: time
              }
              connection.query('INSERT INTO conversation SET ?', conversation_data, function (err, result) {
                if (err) throw err;
                // return new created conversation_id
                return callback(result.insertId);
              });
            }
          });
        }
      });
    });

  }

}


module.exports = socket;
