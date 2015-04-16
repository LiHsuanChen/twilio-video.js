'use strict';

require('../mockwebrtc')();

var assert = require('assert');
var EventEmitter = require('events').EventEmitter;
var Q = require('q');
var util = require('./util');

var SIPJSUserAgent = require('../../lib/signaling/sipjsuseragent');
// var SIPJSUserAgent = require('../../lib/signaling/useragent');

var config = require('../../test');
var accountSid = config['accountSid'];
var authToken = config['authToken'];
var wsServer = config['wsServer'];
var getCapabilityToken =
  require('../token').getCapabilityToken.bind(null, accountSid, authToken);

describe('SIPJSUserAgent', function() {
  var ua1Name = randomName();
  var token = getCapabilityToken(ua1Name);
  var ua1 = null;

  var options = {};
  options['debug'] = false;
  options['wsServer'] = wsServer;
  var inviteOptions = {};
  // inviteOptions['inviteWithoutSdp'] = true;

  describe('constructor', function() {
    it('sets .token', function() {
      ua1 = new SIPJSUserAgent(token, options);
      assert(!ua1.registered);
      assert.equal(token, ua1.token.capabilityTokenString);
    });
  });
  
  describe('#register (without Token)', function() {
    var receivedEvent = false;

    it('updates .registered', function(done) {
      ua1.register().then(function() {
        assert(ua1.registered);
      }).then(done, done);
      ua1.once('registered', function() {
        receivedEvent = true;
      });
    });

    it('emits "registered"', function() {
      assert(receivedEvent);
    });

    describe('#unregister', function() {
      var receivedEvent = false;

      it('updates .registered', function(done) {
        ua1.unregister().then(function() {
          assert(!ua1.registered);
        }).then(done, done);
        ua1.once('unregistered', function() {
          receivedEvent = true;
        });
      });

      it('emits "unregistered"', function() {
        assert(receivedEvent);
      });

      it('does not update .token', function() {
        assert.equal(token, ua1.token.capabilityTokenString);
      });

      describe('#register (again, with new Token)', function() {
        ua1Name = randomName();
        token = getCapabilityToken(ua1Name);
        var receivedEvent = false;

        it('updates .registered', function(done) {
          ua1.register(token).then(function() {
            assert(ua1.registered);
          }).then(done, done);
          ua1.once('registered', function() {
            receivedEvent = true;
          });
        });

        it('emits "registered"', function() {
          assert(receivedEvent);
        });

        it('updates .token', function() {
          assert.equal(token, ua1.token.capabilityTokenString);
        });
      });
    });
  });

  var ua2Name = randomName();
  var ua2 = new SIPJSUserAgent(getCapabilityToken(ua2Name), options);

  describe('Receive incoming call', function() {
    var ict = null;
    var ist = null;
    var ua1Dialog = null;
    var ua2Dialog = null;

    before(function(done) {
      ua2.register().then(function() {
        done();
      }, done);
    });

    it('ua2 registers...', function(done) {
      ua2.register().then(function() { done(); }, done);
    });

    it('emits "invite"', function(done) {
      ict = ua2.invite(ua1Name, inviteOptions);
      ict.then(null, function(error) {
        if (ist === null) {
          done(new Error('InviteClientTransaction failed'));
        }
      });
      ua1.once('invite', function(_ist) {
        ist = _ist;
        try {
          assert.equal(ua1, ist.userAgent);
          assert.equal(ua2Name, ist.from);
          assert(ist.callSid);
        } catch (e) {
          return done(e);
        }
        done();
      });
    });

    it('updates .inviteServerTransactions', function() {
      assert(ua1.inviteServerTransactions.has(ist));
    });

    it('inviteServerTransaction.callSid', function() {
      assert(ist.callSid);
    });

    it.skip('inviteServerTransaction.conversationSid', function() {
      assert(ist.conversationSid);
    });

    describe('InviteServerTransaction#accept', function() {
      it('updates .inviteServerTransactions', function(done) {
        Q.all([
          ict.then(function(_dialog) {
            ua2Dialog = _dialog;
          }),
          ist.accept().then(function(_dialog) {
            assert(!ua1.inviteServerTransactions.has(ist));
            ua1Dialog = _dialog;
          })
        ]).then(function() {
          done();
        }, done);
      });

      it('updates .dialogs', function() {
        assert(ua1.dialogs.has(ua1Dialog));
      });

      it('dialog.callSid', function() {
        assert(ua1Dialog.callSid);
      });

      it.skip('dialog.conversationSid', function() {
        assert(ua1Dialog.conversationSid);
      });

      describe('Dialog "ended" event', function() {
        it('updates .dialogs', function(done) {
          Q.all([
            ua1Dialog.end().then(function() {
              assert(!ua1.dialogs.has(ua1Dialog));
            }),
            ua2Dialog.end().then(function() {
              assert(!ua2.dialogs.has(ua2Dialog));
            })
          ]).then(function() {
            done();
          }, done);
        });
      });
    });

    describe('InviteServerTransaction#reject', function() {
      it('updates .inviteServerTransactions', function(done) {
        var ict = ua2.invite(ua1Name, inviteOptions);
        ua1.once('invite', function(ist) {
          try {
            assert(ua1.inviteServerTransactions.has(ist));
          } catch (e) {
            return done(e);
          }
          ist.reject().then(function() {
            throw new Error('InviteServerTransaction succeeded');
          }, function(ist) {
            assert(ist.rejected);
            assert(!ua1.inviteServerTransactions.has(ist));
          }).then(done, done);
        });
      });
    });

    describe('InviteServerTransaction canceled', function() {
      it('updates .inviteServerTransactions', function(done) {
        var ict = ua2.invite(ua1Name, inviteOptions);
        ua1.once('invite', function(ist) {
          try {
            assert(ua1.inviteServerTransactions.has(ist));
          } catch (e) {
            return done(e);
          }
          ict.cancel().then(function() {
            throw new Error('InviteServerTransaction succeeded');
          }, function(ist) {
            assert(ist.canceled);
            assert(!ua1.inviteServerTransactions.has(ist));
          }).then(done, done);
        });
      });
    });
  });

  describe('#invite', function() {
    var ict = null;
    var ist = null;
    var ua1Dialog = null;
    var ua2Dialog = null;

    it('returns a SIPJSInviteClientTransaction', function(done) {
      // FIXME(mroberts): ...
      // ua2.register().then(function() {
        ict = ua1.invite(ua2Name, inviteOptions);
        ict.then(null, function() {
          if (ist === null) {
            done(new Error('InviteClientTransaction failed'));
          }
        });
        ua2.once('invite', function(_ist) {
          ist = _ist;
          done();
        });
        assert(ict);
      // }).then(null, done);
    });

    it('updates .inviteClientTransactions', function() {
      assert(ua1.inviteClientTransactions.has(ict));
    });

    describe('InviteClientTransaction accepted', function() {
      it('updates .inviteClientTransactions', function(done) {
        Q.all([
          ict.then(function(_dialog) {
            assert(!ua1.inviteClientTransactions.has(ict));
            ua1Dialog = _dialog;
          }),
          ist.accept().then(function(_dialog) {
            ua2Dialog = _dialog;
          })
        ]).then(function() {
          done();
        }, done);
      });

      it('updates .dialogs', function() {
        assert(ua1.dialogs.has(ua1Dialog));
      });

      it('dialog.callSid', function() {
        assert(ua1Dialog.callSid);
      });

      it.skip('dialog.conversationSid', function() {
        assert(ua1Dialog.conversationSid);
      });

      describe('Dialog "ended" event', function() {
        it('updates .dialogs', function(done) {
          ua1Dialog.end().then(function() {
            assert(!ua1.dialogs.has(ua1Dialog));
          }).then(done, done);
          ua2Dialog.end().then(function() {
            assert(!ua2.dialog.has(ua2Dialog));
          });
        });
      });
    });

    describe('InviteClientTransaction#cancel', function() {
      it('updates .inviteClientTransactions', function(done) {
        var ict = ua1.invite(ua2Name, inviteOptions);
        ua2.once('invite', function(ist) {
          try {
            assert(ua1.inviteClientTransactions.has(ict));
          } catch (e) {
            return done(e);
          }
          ict.cancel().then(function() {
            throw new Error('InviteClientTransaction succeeded');
          }, function(ict) {
            assert(ict.canceled);
            assert(!ua1.inviteClientTransactions.has(ict));
          }).then(done, done);
        });
      });
    });

    describe('InviteClientTransaction rejected', function() {
      it('updates .inviteClientTransactions', function(done) {
        var ict = ua1.invite(ua2Name, inviteOptions);
        ua2.once('invite', function(ist) {
          try {
            assert(ua1.inviteClientTransactions.has(ict));
          } catch (e) {
            return done(e);
          }
          ist.reject().then(function() {
            throw new Error('InviteClientTransaction succeeded');
          }, function(ict) {
            assert(ict.rejected);
            assert(!ua1.inviteClientTransactions.has(ict));
          }).then(done, done);
        });
      });
    });
  });
});

function randomName() {
  return Math.random().toString(36).slice(2);
}