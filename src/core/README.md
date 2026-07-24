# Core boundary

`core` will own BoardDocument, commands, coordinate primitives and declared
ports. It must remain independent of React, canvas, persistence, network and
feature modules. The directory intentionally contains no domain implementation
until PR 2.2 introduces the first real owner of board behavior.
