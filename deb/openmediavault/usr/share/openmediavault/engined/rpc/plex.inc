<?php

namespace Engined\Rpc;

class Plex extends \OMV\Rpc\ServiceAbstract {
        /**
         * Get the RPC service name.
         */
        public function getName() {
                return "PLEX";
        }

        /**
         * Initialize the RPC service.
         */
        public function initialize() {
                $this->registerMethod("getServiceStatus");
                $this->registerMethod("getFromUrl");
        }

public function getXmlFromArray($output) {
    $xmlString = is_array($output['response']) ? implode("\n", $output['response']) : $output['response'];
    return $xmlString;
}

        public function getFromUrl($params) {
              $cmd = new \OMV\System\Process("curl -sS http://{$params['host']}{$params['port']}{$params['url']}?X-Plex-Token={$params['token']} -H \"Accept: application/xml\"", "");
              $cmd->setQuiet(TRUE);
              $cmd->setRedirect2to1();
              $cmd->execute($output);
              return $output;
#              return is_array($output) ? implode("\n", $output) : $output;
        }

        public function getServiceStatus($params) {
              $cmd = new \OMV\System\Process("ss -tulnH sport = :{$params['port']}", "");
              $cmd->setRedirect2to1();
              $cmd->setQuiet(TRUE);
              $cmd->execute($output);

              if ($output == null) {
                   return ['status' => false,
                           'debug' => [
                                       'exitStatus' => '500',
                                       'port' => $params['port']
                                      ]
                          ];
              } else {
                   return ['status' => true,
                           'debug' => [
                                       'exitStatus' => '200',
                                       'port' => $params['port']
                                      ] 
                          ];
              }
              
        }

}
